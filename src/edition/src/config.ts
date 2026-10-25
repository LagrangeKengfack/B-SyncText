// Configuration lue dans l'environnement (fichier d'environnement systemd sur l'EC2).

export interface Tables {
  redacteurs: string;
  credits: string;
  documents: string;
  membres: string;
  journal: string;
  versions: string;
  compteurs: string;
}

export interface Config {
  tables: Tables;
  bucket: string;
  paramSecretSession: string;
  secretOrigine: string;
  port: number;
}

function requise(env: NodeJS.ProcessEnv, nom: string): string {
  const valeur = env[nom];
  if (!valeur) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return valeur;
}

export function lireConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    tables: {
      redacteurs: requise(env, 'TABLE_REDACTEURS'),
      credits: requise(env, 'TABLE_CREDITS'),
      documents: requise(env, 'TABLE_DOCUMENTS'),
      membres: requise(env, 'TABLE_MEMBRES'),
      journal: requise(env, 'TABLE_JOURNAL'),
      versions: requise(env, 'TABLE_VERSIONS'),
      compteurs: requise(env, 'TABLE_COMPTEURS'),
    },
    bucket: requise(env, 'BUCKET_DONNEES'),
    paramSecretSession: requise(env, 'PARAM_SECRET_SESSION'),
    secretOrigine: requise(env, 'SECRET_ORIGINE'),
    port: Number(env.PORT ?? 8080),
  };
}
