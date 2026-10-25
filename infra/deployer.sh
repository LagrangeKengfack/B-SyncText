#!/usr/bin/env bash
# Déploie ou met à jour toute l'application B-SyncText.
# Usage : infra/deployer.sh <email>   (email : alertes de budget et expéditeur SES)
# Prérequis : AWS CLI connectée (aws login), Node 22, npm ci déjà fait.
set -euo pipefail

EMAIL="${1:?usage : infra/deployer.sh <email>}"
REGION="${AWS_REGION:-eu-north-1}"
PILE="bsynctext"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
cd "$(dirname "$0")/.."

COMPTE=$(aws sts get-caller-identity --query Account --output text)
ARTEFACTS="bsynctext-artefacts-$COMPTE"
PAQUETS="infra/paquets"

etape() { echo; echo "== $*"; }

etape "1. Secrets dans SSM (créés une seule fois, jamais dans le dépôt)"
secret() {   # crée le secret s'il manque ; si la création échoue (secret déjà là, réseau), on vérifie seulement qu'il existe
  aws ssm get-parameter --name "$1" >/dev/null 2>&1 && return 0
  aws ssm put-parameter --name "$1" --type SecureString \
    --value "$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$2")" >/dev/null 2>&1 \
    || aws ssm get-parameter --name "$1" >/dev/null
}
secret /bsynctext/secret-session 48
secret /bsynctext/secret-origine 40
secret /bsynctext/code-admin 12

etape "2. Bucket des artefacts"
if ! aws s3api head-bucket --bucket "$ARTEFACTS" 2>/dev/null; then
  aws s3api create-bucket --bucket "$ARTEFACTS" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  aws s3api put-public-access-block --bucket "$ARTEFACTS" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi

etape "3. Construction et paquets"
npm run build
rm -rf "$PAQUETS" && mkdir -p "$PAQUETS"
paquet() {   # $1 = nom du paquet, $2… = options ; bundle ESM unique pour Node 22
  local nom="$1"; shift
  npx esbuild "src/$nom/src/index.ts" --bundle --platform=node --target=node22 --format=esm \
    --outfile="$PAQUETS/$nom/index.mjs" --log-level=warning "$@" \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
}
# Le SDK AWS v3 est fourni par l'environnement Lambda nodejs22.x : on ne l'embarque pas (paquets 5 fois plus petits).
paquet api --external:@aws-sdk/*
paquet telechargement --external:@aws-sdk/*
paquet edition
# Envoi vers S3 avec reprises : une connexion lente coupe parfois un transfert
# Un fichier déjà présent avec la même empreinte n'est pas renvoyé.
envoyer() {
  local empreinte; empreinte=$(sha256sum "$1" | cut -c1-64)
  local bucket="${2#s3://}"; bucket="${bucket%%/*}"; local cle="${2#s3://*/}"
  if [ "$(aws s3api head-object --bucket "$bucket" --key "$cle" --query 'Metadata.sha256' --output text 2>/dev/null)" = "$empreinte" ]; then
    echo "déjà en place : $cle"; return 0
  fi
  local i; for i in 1 2 3 4; do
    aws s3 cp "$1" "$2" --only-show-errors --metadata "sha256=$empreinte" && return 0
    echo "nouvel essai ($i)…"; sleep 3
  done; return 1
}
for p in api telechargement; do (cd "$PAQUETS/$p" && zip -qr "../$p.zip" .); done
CLE_API="lambda/api-$(sha256sum "$PAQUETS/api.zip" | cut -c1-12).zip"
CLE_TEL="lambda/telechargement-$(sha256sum "$PAQUETS/telechargement.zip" | cut -c1-12).zip"
envoyer "$PAQUETS/api.zip" "s3://$ARTEFACTS/$CLE_API"
envoyer "$PAQUETS/telechargement.zip" "s3://$ARTEFACTS/$CLE_TEL"
envoyer "$PAQUETS/edition/index.mjs" "s3://$ARTEFACTS/edition/index.mjs"

etape "4. Pile CloudFormation"
SECRET_ORIGINE=$(aws ssm get-parameter --name /bsynctext/secret-origine --with-decryption --query Parameter.Value --output text)
aws cloudformation deploy --stack-name "$PILE" --template-file infra/template.yaml \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides EmailAuteur="$EMAIL" BucketArtefacts="$ARTEFACTS" \
    CleCodeApi="$CLE_API" CleCodeTelechargement="$CLE_TEL" SecretOrigine="$SECRET_ORIGINE"

sortie() { aws cloudformation describe-stacks --stack-name "$PILE" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
ADRESSE=$(sortie Adresse); SITE=$(sortie BucketSite); DISTRIB=$(sortie IdDistribution); INSTANCE=$(sortie IdServeurEdition)

etape "5. Application web"
aws s3 sync src/web/dist "s3://$SITE" --delete --only-show-errors
aws cloudfront create-invalidation --distribution-id "$DISTRIB" --paths "/*" --query Invalidation.Id --output text

etape "6. Serveur d'édition (mise à jour par SSM, sans SSH)"
if aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$INSTANCE" --query "InstanceInformationList[0].PingStatus" --output text | grep -q Online; then
  aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
    --parameters commands=/usr/local/bin/bsynctext-maj --query Command.CommandId --output text
else
  echo "Instance pas encore joignable par SSM : le code est installé à son premier démarrage."
fi

etape "7. Identité e-mail SES (vérifiée une fois, par un lien reçu par e-mail)"
aws sesv2 get-email-identity --email-identity "$EMAIL" >/dev/null 2>&1 || \
  aws sesv2 create-email-identity --email-identity "$EMAIL" >/dev/null

etape "8. Budget (alertes à 5, 10 et 20 USD)"
if ! aws budgets describe-budget --account-id "$COMPTE" --budget-name bsynctext >/dev/null 2>&1; then
  aws budgets create-budget --account-id "$COMPTE" \
    --budget '{"BudgetName":"bsynctext","BudgetType":"COST","TimeUnit":"MONTHLY","BudgetLimit":{"Amount":"20","Unit":"USD"}}' \
    --notifications-with-subscribers "$(for s in 25 50 100; do printf '{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":%s},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"%s"}]},' "$s" "$EMAIL"; done | sed 's/,$//; s/^/[/; s/$/]/')"
fi

echo
echo "Application : $ADRESSE"
echo "Code administrateur : aws ssm get-parameter --name /bsynctext/code-admin --with-decryption --query Parameter.Value --output text"
