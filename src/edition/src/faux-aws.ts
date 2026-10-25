// Faux clients DynamoDB et S3 en mémoire, pour les tests (non compilés dans dist).
// Le faux DynamoDB interprète le sous-ensemble d'expressions utilisé par le serveur.
import type { Tables } from './config.js';
import type { Client, Dependances } from './dependances.js';

type Item = Record<string, unknown>;

export const TABLES: Tables = {
  redacteurs: 'Redacteurs',
  credits: 'Credits',
  documents: 'Documents',
  membres: 'Membres',
  journal: 'Journal',
  versions: 'Versions',
  compteurs: 'Compteurs',
};

const CLES: Record<string, string[]> = {
  Redacteurs: ['email'],
  Credits: ['email', 'jour'],
  Documents: ['docId'],
  Membres: ['docId', 'email'],
  Journal: ['docId', 'seq'],
  Versions: ['docId', 'versionId'],
  Compteurs: ['cle'],
};

function erreur(nom: string): Error {
  const e = new Error(nom);
  e.name = nom;
  return e;
}

/** Découpe sur les virgules hors parenthèses. */
function decouper(texte: string): string[] {
  const parts: string[] = [];
  let prof = 0;
  let cour = '';
  for (const ch of texte) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ',' && prof === 0) {
      parts.push(cour.trim());
      cour = '';
    } else cour += ch;
  }
  if (cour.trim()) parts.push(cour.trim());
  return parts;
}

export class FauxDynamo implements Client {
  tables = new Map<string, Map<string, Item>>();
  commandes: { nom: string; input: Record<string, unknown> }[] = [];
  /** Permet de simuler une panne sur une commande. */
  panne?: (nom: string, input: Record<string, unknown>) => Error | undefined;

  private table(nom: string): Map<string, Item> {
    let t = this.tables.get(nom);
    if (!t) this.tables.set(nom, (t = new Map()));
    return t;
  }

  private cle(table: string, item: Item): string {
    return JSON.stringify((CLES[table] ?? Object.keys(item)).map((k) => item[k]));
  }

  get(table: string, key: Item): Item | undefined {
    return this.table(table).get(this.cle(table, key));
  }

  put(table: string, item: Item): void {
    this.table(table).set(this.cle(table, item), structuredClone(item));
  }

  items(table: string): Item[] {
    return [...this.table(table).values()];
  }

  async send(commande: { constructor: { name: string }; input: Record<string, unknown> }): Promise<unknown> {
    const nom = commande.constructor.name;
    const input = commande.input;
    this.commandes.push({ nom, input });
    const p = this.panne?.(nom, input);
    if (p) throw p;
    const table = input.TableName as string;
    switch (nom) {
      case 'GetCommand':
        return { Item: structuredClone(this.get(table, input.Key as Item)) };
      case 'PutCommand':
        this.put(table, input.Item as Item);
        return {};
      case 'QueryCommand':
        return this.query(table, input);
      case 'UpdateCommand':
        return this.update(table, input);
      default:
        throw new Error(`commande non simulée : ${nom}`);
    }
  }

  private query(table: string, input: Record<string, unknown>) {
    const v = input.ExpressionAttributeValues as Item;
    if (input.KeyConditionExpression !== 'docId = :d AND seq >= :s') throw new Error('requête non simulée');
    const items = this.items(table)
      .filter((i) => i.docId === v[':d'] && String(i.seq) >= String(v[':s']))
      .sort((a, b) => (String(a.seq) < String(b.seq) ? -1 : 1));
    return { Items: structuredClone(items) };
  }

  private update(table: string, input: Record<string, unknown>) {
    const noms = (input.ExpressionAttributeNames ?? {}) as Record<string, string>;
    const vals = (input.ExpressionAttributeValues ?? {}) as Item;
    const resoudre = (expr: string) => expr.replace(/#\w+/g, (n) => noms[n] ?? n);
    const key = input.Key as Item;
    const ancien = this.get(table, key);
    const item: Item = structuredClone(ancien) ?? { ...key };

    const operande = (o: string): unknown => {
      o = o.trim();
      const ine = /^if_not_exists\((\w+),\s*(:\w+)\)$/.exec(o);
      if (ine) return item[ine[1]!] ?? vals[ine[2]!];
      if (o.startsWith(':')) return vals[o];
      return item[o];
    };

    if (input.ConditionExpression) {
      const cond = resoudre(input.ConditionExpression as string);
      const prim = (c: string): boolean => {
        c = c.trim();
        let m = /^attribute_not_exists\((\w+)\)$/.exec(c);
        if (m) return ancien?.[m[1]!] === undefined;
        m = /^attribute_exists\((\w+)\)$/.exec(c);
        if (m) return ancien?.[m[1]!] !== undefined;
        m = /^(\w+)\s*(>=|<=|>|<|=)\s*(:\w+)$/.exec(c);
        if (!m) throw new Error(`condition non simulée : ${c}`);
        const a = ancien?.[m[1]!] as number;
        const b = vals[m[3]!] as number;
        if (a === undefined) return false;
        return { '>=': a >= b, '<=': a <= b, '>': a > b, '<': a < b, '=': a === b }[m[2]!]!;
      };
      const ok = cond.split(' OR ').some((ou) => ou.split(' AND ').every(prim));
      if (!ok) throw erreur('ConditionalCheckFailedException');
    }

    const expr = resoudre(input.UpdateExpression as string);
    const modifies = new Set<string>();
    for (const [, mot, corps] of expr.matchAll(/(SET|ADD|REMOVE)\s+(.*?)(?=\s+(?:SET|ADD|REMOVE)\s|$)/g)) {
      for (const action of decouper(corps!)) {
        if (mot === 'SET') {
          const [chemin, valeur] = action.split(/\s*=\s*(.*)/s) as [string, string];
          const m = /^(.+?)\s([+-])\s(.+)$/.exec(valeur);
          item[chemin] = m
            ? (operande(m[1]!) as number) + (m[2] === '+' ? 1 : -1) * (operande(m[3]!) as number)
            : operande(valeur);
          modifies.add(chemin);
        } else if (mot === 'ADD') {
          const [chemin, v] = action.split(/\s+/) as [string, string];
          item[chemin] = ((item[chemin] as number) ?? 0) + (vals[v] as number);
          modifies.add(chemin);
        } else {
          delete item[action];
          modifies.add(action);
        }
      }
    }
    this.put(table, item);
    const rv = input.ReturnValues;
    if (rv === 'ALL_NEW') return { Attributes: structuredClone(item) };
    if (rv === 'UPDATED_NEW') return { Attributes: Object.fromEntries([...modifies].map((k) => [k, item[k]])) };
    return {};
  }
}

export class FauxS3 implements Client {
  objets = new Map<string, { octets: Uint8Array; metadonnees: Record<string, string> }>();
  commandes: string[] = [];

  async send(commande: { constructor: { name: string }; input: Record<string, unknown> }): Promise<unknown> {
    const nom = commande.constructor.name;
    const input = commande.input;
    this.commandes.push(`${nom} ${String(input.Key)}`);
    if (nom === 'PutObjectCommand') {
      this.objets.set(input.Key as string, {
        octets: new Uint8Array(input.Body as Uint8Array),
        metadonnees: (input.Metadata ?? {}) as Record<string, string>,
      });
      return {};
    }
    if (nom === 'GetObjectCommand') {
      const o = this.objets.get(input.Key as string);
      if (!o) throw erreur('NoSuchKey');
      return { Body: { transformToByteArray: async () => new Uint8Array(o.octets) }, Metadata: o.metadonnees };
    }
    throw new Error(`commande S3 non simulée : ${nom}`);
  }
}

export function fauxDeps(debut = Date.UTC(2026, 9, 25, 10, 0, 0)) {
  const horloge = { ms: debut };
  const ddb = new FauxDynamo();
  const s3 = new FauxS3();
  const deps: Dependances = { ddb, s3, tables: TABLES, bucket: 'donnees', maintenant: () => horloge.ms };
  return { deps, ddb, s3, horloge };
}
