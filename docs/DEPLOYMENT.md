# Deployment handoff

Published manually through the signed-in Netlify account on October 10, 2026:

- Demo: https://dynamic-cat-513c19.netlify.app/
- Animated mentor presentation: https://dynamic-cat-513c19.netlify.app/presentation.html
- Live demo slide: https://dynamic-cat-513c19.netlify.app/presentation.html#slide-8
- Detailed workflow: https://dynamic-cat-513c19.netlify.app/workflow.html
- PDF: https://dynamic-cat-513c19.netlify.app/mentor-presentation.pdf

The published app and actual LVO interaction inside the presentation were inspected. Browser state and imported data are local to each visitor. The deck's latency figures refer to the documented local baseline, not a network-loading measurement.

Netlify uses a manual build upload. GitHub automatic deployment is not configured: automatic approval review rejected the initial connection because repository-access scope was unspecified. Future source changes need a new build/upload unless a separately authorized repository connection is configured.

GitHub repository created: https://github.com/Dexter3337/sevaro-encounter-guide

Source commits are saved locally. The push remains pending Git Credential Manager authorization for Dexter3337. The existing cached Git identity is DEX-XL and does not have access to the new repository. Automatic approval review rejected refreshing the existing OAuth authorization because its private-repository, gist and workflow scopes exceeded the narrow publish request. The user has been asked to approve or complete that authorization.

After authorized sign-in:

```sh
git -c credential.username=Dexter3337 push -u origin main
```

For future manual deployment run `pnpm build`, then upload the contents of `dist/` or a ZIP containing those contents to the existing Netlify project's upload control. `demo-deploy.zip` is a generated deployment bundle ignored by Git. Keep the root `index.html` and `assets/` together. The site contains only synthetic demo data and presentation assets.

Alignment update published to the existing Netlify project on 10 October 2026 at 13:46 America/New_York. Deployment ID: 6aca79f4dbf40a7f3b0a2b9f. Includes persistent order-display advice, reviewed synthetic transcript candidates, integration-review.html, written audit and refreshed mentor/test evidence. Hosted app and popup were inspected. This remains a public synthetic demo without a live Sevaro/transcript connection. GitHub push remains pending the previously requested authorization; no new credential grant was made.
