# Loopy Shopify app (theme blocks)

A small custom app for tucokids.com. It adds two things to the theme editor, and nothing else:

- **Loopy Video** (app block): add it to a section that accepts apps (on your home page that is the "Apps" item in the
  template list), paste a widget ID, and set sizes, shapes and corners separately for desktop and mobile.
- **Loopy floating video** (app embed): switch it on under Theme settings > App embeds to show one floating or spotlight
  widget on every page.

Both load the same widget script from Loopy, so videos still come from Loopy's storage, not Shopify.
The app has no server and reads no store data. It can only add blocks to themes.

## One-time setup

1. In the Dev Dashboard (https://dev.shopify.com/dashboard), open Apps, create an app named **Loopy**,
   and copy its **Client ID** (Settings).
2. Put the Client ID into `shopify.app.toml` (`client_id = "..."`).
3. In a terminal, from this folder, deploy it. The first time, a browser window asks you to log in and click Allow:

   ```bash
   cd ~/Downloads/tuco-video-platform/shopify-app && npx @shopify/cli@latest app deploy
   ```

   This creates an app version. It does not change any theme.
4. Install the app on tucokids.com from the Dev Dashboard (the app's page, "Install app", pick your store).

## Try it in the draft theme

1. Online Store > Themes > the draft theme (for example "Teen page testing") > Customize.
2. On the home page, open **Apps** in the template list, click **Add block**, choose **Loopy Video**.
   (Or use Add section > Apps if your theme offers it.)
3. Paste the widget ID, for example `wgt_e47c955a`. Copy IDs from Loopy: Widgets, **Get embed code**.
4. For a floating video: the gear icon (Theme settings) > **App embeds** > turn on **Loopy floating video**, paste its widget ID.
5. Nothing reaches the live theme until you publish that theme.

## Changing the settings

The editor controls come from one table in `../tools/build-theme-section.py`. After editing it, run:

```bash
cd ~/Downloads/tuco-video-platform/shopify-app && npm run regenerate
```

Then deploy again (step 3). The theme section, this app block and the widget script stay in sync.

## Later (optional): sales on Home

To let Shopify send paid orders to Loopy, uncomment the webhook block in `shopify.app.toml`, set `scopes = "read_orders"`,
and set the app's client secret as `SHOPIFY_WEBHOOK_SECRET` on the Loopy API.

## Checks done

Theme Check reports no problems in both blocks, and both render correctly in a local Liquid test (ID trimmed, text
escaped, nothing shown when the ID is empty, hint shown in the theme editor). Not yet tried inside your real theme:
that is the first thing to look at in the draft theme.
