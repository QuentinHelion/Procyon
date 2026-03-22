# Procyon

Application web **ultra légère** de suivi des vulnérabilités : tableau en colonnes (style To Do), saisie manuelle et import de rapports via des **modèles de scan** extensibles.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Prisma** + **PostgreSQL**
- **Tailwind CSS** v4
- **Docker Compose** (application + base)

## Démarrage local

1. Copier l’environnement :

   ```bash
   cp .env.example .env
   ```

2. Démarrer PostgreSQL (ou utiliser une instance existante et adapter `DATABASE_URL`).

3. Installer et migrer :

   ```bash
   npm install
   npx prisma migrate deploy
   npx prisma db seed
   npm run dev
   ```

4. Ouvrir [http://localhost:3000](http://localhost:3000).

### Pages

| Chemin | Rôle |
|--------|------|
| `/` | Tableau type To Do (colonnes par statut) |
| `/planning` | **Rétro-planning** : périodes, 14 jours, **Kanban** (statuts), **Gantt** (création → échéance), filtres |
| `/rapports` | Liste des **fichiers importés** archivés (consultation / téléchargement) |

## Docker

```bash
docker compose up --build
```

L’application écoute sur le port **3000**. Les migrations et le seed des modèles intégrés s’exécutent au démarrage du conteneur. Un volume Docker **`procyon_reports`** conserve les fichiers de rapports importés (`REPORTS_DIR=/app/data/reports`).

## Apparence & archives

- **Thème** : menu **Paramètres** (engrenage dans la barre du haut) → **Clair**, **Sombre** ou **Système** (préférence dans le navigateur).
- **Rapports** : chaque import réussi enregistre une copie sur le disque (`REPORTS_DIR`). La page **`/rapports`** liste les fichiers ; le menu Paramètres propose un raccourci vers cette page.
- **Échéances** : champ optionnel **`dueAt`** (tableau, planning).
- **Acquittement** : **`acknowledgedAt`** enregistre la prise de connaissance d’une alerte (`true` / date côté API, ou `null` pour révoquer). Indépendant du statut « Terminé ».

## Modèles de scan

- **pingcastle-xml** : parseur `pingcastle_xml` pour les exports XML PingCastle (détection souple des nœuds de type règle de risque).
- **generic-csv** : parseur `generic_csv` ; en-tête CSV : `title`, `severity`, `description` (optionnel), `externalRef` (optionnel). Valeurs de `severity` : `INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

Depuis l’UI, **Nouveau modèle** permet d’ajouter un enregistrement (nom, slug, parseur) réutilisant un parseur déjà codé.

### Ajouter un nouvel outil (développeur)

1. Implémenter une fonction de parse dans `src/lib/parsers/` qui renvoie `ParseResult`.
2. L’enregistrer dans `src/lib/parsers/index.ts` (`runParser`).
3. Ajouter l’identifiant dans `src/lib/parser-ids.ts` (`PARSER_IDS`).
4. (Optionnel) seed ou création UI d’un modèle pointant vers ce `parserId`.

## API (aperçu)

| Méthode | Chemin | Rôle |
|--------|--------|------|
| `GET` / `POST` | `/api/vulnerabilities` | Lister / créer |
| `PATCH` / `DELETE` | `/api/vulnerabilities/[id]` | Mettre à jour / supprimer |
| `GET` / `POST` | `/api/templates` | Lister / créer un modèle |
| `POST` | `/api/import` | `multipart/form-data` : `file`, `templateSlug` |
| `GET` | `/api/reports` | Liste des imports (métadonnées + présence du fichier archivé) |
| `GET` | `/api/reports/[id]/file` | Fichier archivé (`?download=1` pour forcer le téléchargement) |

Les imports avec `externalRef` mettent à jour une entrée existante portant la même référence.

## Licence

Apache License 2.0
