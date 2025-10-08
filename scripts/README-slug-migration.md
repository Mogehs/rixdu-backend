# Listing Slug Migration

This script updates all existing listing slugs from the old format to the new SEO-friendly format.

## New Slug Format

The new slugs follow this pattern:

```
/category/subcategory/listing-title-uniqueId
```

Examples:

- `/motor/vehicles/bmw-x5-2023-abc123`
- `/electronics/phones/iphone-14-pro-max-def456`
- `/real-estate/apartments/luxury-apartment-downtown-ghi789`

## Running the Migration

### 1. Preview Changes (Dry Run)

```bash
npm run migrate:slugs:dry-run
```

This will show you what the new slugs will look like without making any changes.

### 2. Run the Migration

```bash
npm run migrate:slugs
```

This will update all listing slugs in the database.

⚠️ **Important**: Always run the dry run first to preview changes!

## What the Migration Does

1. **Fetches all listings** from the database
2. **Generates new slugs** based on:
   - Category path (e.g., motor/vehicles)
   - Listing title (from values.title or values.name)
   - Unique identifier for uniqueness
3. **Ensures uniqueness** by adding suffixes if needed
4. **Updates listings** in batches for performance
5. **Provides progress feedback** and error reporting

## Technical Details

### Slug Generation Logic

1. Get category path from `categoryPath` field
2. Convert category names to URL-friendly slugs
3. Extract title from listing values
4. Combine with unique identifier
5. Ensure uniqueness across all listings

### Error Handling

- If category lookup fails, falls back to simple format
- If title is missing, uses "listing" as default
- Continues processing even if individual listings fail
- Provides detailed error reporting

### Performance

- Processes listings in batches of 100
- Small delays between batches to avoid overwhelming DB
- Memory-efficient processing for large datasets

## After Migration

Once the migration is complete:

- All new listings will automatically use the new format
- Existing listings will have been updated
- Both old and new slug formats are supported for lookups
- SEO will be improved with descriptive URLs

## Rollback

If you need to rollback:

1. The script doesn't backup old slugs automatically
2. Consider backing up your database before running
3. The old slug generation logic is still available if needed

## Monitoring

After migration, monitor:

- 404 errors for old slug references
- Search engine indexing updates
- Frontend routing compatibility
