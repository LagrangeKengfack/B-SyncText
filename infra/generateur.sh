#!/usr/bin/env bash
# Générateur de charge temporaire, dans la même région que l'application.
# Usage :
#   infra/generateur.sh creer                 crée la machine (pile bsynctext-generateur)
#   infra/generateur.sh lancer "<commande>"   envoie les tests, lance la commande, rapatrie les résultats
#   infra/generateur.sh supprimer             supprime la machine
set -euo pipefail
REGION="${AWS_REGION:-eu-north-1}"; export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
cd "$(dirname "$0")/.."
PILE=bsynctext-generateur
COMPTE=$(aws sts get-caller-identity --query Account --output text)
ARTEFACTS="bsynctext-artefacts-$COMPTE"
ressource() { aws cloudformation describe-stack-resource --stack-name bsynctext --logical-resource-id "$1" --query StackResourceDetail.PhysicalResourceId --output text; }
machine() { aws cloudformation describe-stacks --stack-name $PILE --query "Stacks[0].Outputs[0].OutputValue" --output text; }

case "${1:-}" in
creer)
  aws cloudformation deploy --stack-name $PILE --template-file infra/generateur.yaml --capabilities CAPABILITY_IAM \
    --parameter-overrides SousReseau="$(ressource SousReseauA)" Vpc="$(ressource Vpc)" BucketArtefacts="$ARTEFACTS"
  echo "Machine : $(machine)" ;;
lancer)
  CMD="${2:?commande manquante}"
  # Un fichier par script de test, avec ses dépendances (ws, yjs, unpdf…)
  rm -rf infra/paquets/tests && mkdir -p infra/paquets/tests
  for f in tests/concurrence/t0*.mjs tests/charge/redacteurs.mjs; do
    npx esbuild "$f" --bundle --platform=node --target=node22 --format=esm --log-level=error \
      --outfile="infra/paquets/tests/$(basename "$f")" \
      --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
  done
  cp tests/charge/t06-pic.js infra/paquets/tests/
  aws s3 sync infra/paquets/tests "s3://$ARTEFACTS/charge/tests/" --delete --only-show-errors
  M=$(machine)
  SCRIPT="set -e; mkdir -p /opt/essais /opt/resultats; cd /opt/essais; aws s3 sync s3://$ARTEFACTS/charge/tests/ . --only-show-errors; ulimit -n 200000; export RESULTATS_DIR=/opt/resultats; $CMD; aws s3 sync /opt/resultats s3://$ARTEFACTS/charge/resultats/ --only-show-errors"
  ID=$(aws ssm send-command --instance-ids "$M" --document-name AWS-RunShellScript --timeout-seconds 3600 \
    --parameters "$(jq -n --arg c "$SCRIPT" '{commands:[$c], executionTimeout:["3600"]}')" --query Command.CommandId --output text)
  echo "Commande $ID lancée ; attente…"
  while true; do
    S=$(aws ssm get-command-invocation --command-id "$ID" --instance-id "$M" --query Status --output text 2>/dev/null || echo Pending)
    case "$S" in Success|Failed|Cancelled|TimedOut) break;; esac; sleep 10
  done
  aws ssm get-command-invocation --command-id "$ID" --instance-id "$M" --query StandardOutputContent --output text
  aws s3 sync "s3://$ARTEFACTS/charge/resultats/" docs/tests/resultats/ --only-show-errors
  echo "Statut : $S" ;;
supprimer)
  aws cloudformation delete-stack --stack-name $PILE
  aws cloudformation wait stack-delete-complete --stack-name $PILE
  aws s3 rm "s3://$ARTEFACTS/charge/" --recursive --only-show-errors || true
  echo "Générateur supprimé." ;;
*) echo "usage : $0 creer | lancer \"<commande>\" | supprimer"; exit 1 ;;
esac
