#!/usr/bin/env bash
# Supprime toutes les ressources de B-SyncText (irréversible : les documents sont perdus).
# Usage : infra/supprimer.sh
set -euo pipefail

REGION="${AWS_REGION:-eu-north-1}"
PILE="bsynctext"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
COMPTE=$(aws sts get-caller-identity --query Account --output text)
ARTEFACTS="bsynctext-artefacts-$COMPTE"

read -r -p "Supprimer définitivement B-SyncText du compte $COMPTE ? (oui/non) " reponse
[ "$reponse" = "oui" ] || { echo "Annulé."; exit 1; }

sortie() { aws cloudformation describe-stacks --stack-name "$PILE" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null || true; }

echo "== 1. Vider les buckets (CloudFormation ne supprime pas un bucket non vide)"
for b in "$(sortie BucketSite)" "$(sortie BucketDonnees)"; do
  [ -n "$b" ] && [ "$b" != "None" ] && aws s3 rm "s3://$b" --recursive --only-show-errors || true
done

echo "== 2. Supprimer la pile et attendre la fin"
aws cloudformation delete-stack --stack-name "$PILE"
aws cloudformation wait stack-delete-complete --stack-name "$PILE"

echo "== 3. Artefacts, secrets, budget"
aws s3 rb "s3://$ARTEFACTS" --force >/dev/null 2>&1 || true
aws ssm delete-parameters --names /bsynctext/secret-session /bsynctext/secret-origine /bsynctext/code-admin >/dev/null || true
aws budgets delete-budget --account-id "$COMPTE" --budget-name bsynctext 2>/dev/null || true

echo "== 4. Vérification : ressources restantes portant le nom du projet"
aws cloudformation describe-stacks --stack-name "$PILE" >/dev/null 2>&1 && echo "PILE ENCORE PRÉSENTE" || echo "pile : supprimée"
aws s3 ls | grep -i bsynctext || echo "buckets : aucun"
echo "Terminé."
