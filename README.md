# Limbus Company News Archive

A searchable archive of official Limbus Company notices, live at https://lcna.whosmalikx.com.

Every notice has its own page at `/notices/<date>-<title>/`, and the archive works without JavaScript (search needs it).

## How it's built

This repo is generated. The notices and templates live in [limbus-news-pipeline](https://github.com/ItsMalikx/limbus-notice-pipeline), and changes should be made there, not here.

To publish an update from the pipeline:

```
python scripts/pipeline.py build
python scripts/pipeline.py check
python scripts/pipeline.py deploy
```

`deploy` copies the new build into this repo. Review the changes, commit and push, and Cloudflare Pages publishes it.

## Hosting

It's all static files on Cloudflare Pages. Old addresses (`/notices/N/`, `/notice?id=N`) redirect to the current ones through `_redirects`, and missing pages show `404.html`.
