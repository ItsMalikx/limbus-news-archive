# Limbus Company News Archive

A searchable archive of transcribed official Limbus Company notices, live at
https://lcna.whosmalikx.com.

The website contains generated HTML for every notice at `/notices/ID/`, static
archive pagination, and JavaScript search. Notice content and navigation remain
available without JavaScript. IDs remain stable when historical notices are added
or chronology is corrected.

## Update and publish

Run these commands from the adjacent `limbus-news-pipeline` directory:

```powershell
python scripts/pipeline.py build
python scripts/pipeline.py check
python scripts/pipeline.py deploy --dry-run
python scripts/pipeline.py deploy
```

The last command transfers the **complete validated release** into this checkout
and backs up replaced files. Review the diff, commit, and push using the normal
Cloudflare Pages Git deployment. It does not publish automatically from the pipeline.

Do not update only `data/notices.json` and `sitemap.xml`: the HTML pages, index,
archive pagination, JavaScript, and redirect handler must belong to the same release.
Deploy this repository root as the Pages output directory, including `_worker.js`
and `_routes.json`. Advanced-mode Workers must be supported by your deployment method.

After publishing, run this from the pipeline:

```powershell
python scripts/audit_site.py z_Output/site --live
```

Submit `/sitemap.xml` in Search Console and review its affected URL examples.
Google decides when to recrawl and index pages; technical validation is not an
indexing guarantee.

## Routing

`/notice?id=N` and `/notice.html?id=N` redirect permanently to `/notices/N/` for
existing notices. Invalid IDs return HTTP 404. Unknown static paths use `404.html`.
Keep the top-level error page and avoid a catch-all homepage rewrite.

The Worker runs only on legacy notice and explicit 404 routes. Other pages and
assets use normal Cloudflare Pages static serving. On other hosts, implement
equivalent query-aware redirects and real 404 responses.

## Editing

Generated HTML and JavaScript come from `limbus-news-pipeline/site_templates/` and
its renderer. Edit those source templates to retain changes across builds. Styles
and icons in this repository's `assets/` are reused by the pipeline.

Classification and date review reports live in the pipeline's `z_Output/` directory.
See its README for stable-ID recovery, manual title overrides, tests, and backups.

## License

GNU General Public License v3.0; see [LICENSE](LICENSE).
