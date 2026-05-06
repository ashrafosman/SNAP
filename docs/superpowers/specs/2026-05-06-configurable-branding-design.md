# Configurable Branding — Design Spec
_Date: 2026-05-06_

## Goal

Make the app white-label configurable for any agency/program. Currently hardcoded for "SNAP QC Guard — Michigan". After this change, an admin (data_engineer role) can update agency name, program name, state, accent color, tagline, and footer alert through a Settings UI without touching code or redeploying.

---

## Config Schema

Six branding fields persisted as a JSON file in a Databricks Volume:

```json
{
  "agency_name":  "Michigan SNAP",
  "program_name": "SNAP QC Guard",
  "state":        "Michigan",
  "accent_color": "#ef4444",
  "tagline":      "Early Warning System",
  "footer_alert": "Oct 2026: SNAP cost-share shifts to 25/75. 40K recipients at risk."
}
```

The Volume path is read from the `APP_CONFIG_VOLUME` environment variable (e.g. `/Volumes/main/default/snap_qc/app_config.json`). If the env var is unset, the app falls back to `data/app_config.json` for local development. If the file does not exist on first boot, it is created with the above defaults.

---

## Architecture

```
Frontend                          Backend
--------                          -------
BrandingContext (fetch on mount)  GET /api/settings/config  → config_store.read()
                                  PUT /api/settings/config  → config_store.write()

Layout.tsx (consumes useBranding)
Settings.tsx (form + save)
```

---

## Backend

### `server/config_store.py` (new)

Thin module with two functions:

- `read_config() -> dict` — downloads the JSON file from the Databricks Volume using `WorkspaceClient().files.download()`. Falls back to reading `data/app_config.json` when `IS_DATABRICKS_APP` is False (same dual-mode pattern as `server/config.py`). Returns defaults if the file doesn't exist yet.
- `write_config(data: dict) -> dict` — validates that all 6 expected keys are present and that `accent_color` is a valid hex string, then uploads the JSON to the Volume using `WorkspaceClient().files.upload()`. Returns the saved config.

### `server/routes/settings.py` (new)

```
GET  /api/settings/config   → returns config JSON
PUT  /api/settings/config   → accepts config JSON body, saves, returns saved config
```

Registered in `app.py` as `app.include_router(settings.router, prefix="/api")`.

No separate auth guard — the Settings page is only reachable by the `data_engineer` role in the frontend nav.

---

## Frontend

### `frontend/src/context/BrandingContext.tsx` (new)

- Fetches `GET /api/settings/config` on mount.
- Provides a `useBranding()` hook returning `{ branding: BrandingConfig, setBranding, loading }`.
- `BrandingProvider` wraps the app in `main.tsx` (alongside `RoleProvider`).
- While loading, components render with default values to avoid flash.

### `frontend/src/components/Layout.tsx` (update)

Three hardcoded strings replaced with branding values:

| Location | Before | After |
|---|---|---|
| App title (line ~53) | `"SNAP QC Guard"` | `{branding.program_name}` |
| Subtitle (line ~55) | `"Early Warning System — Michigan"` | `` `${branding.tagline} — ${branding.state}` `` |
| Sidebar footer (line ~122) | `"Oct 2026: SNAP cost-share shifts..."` | `{branding.footer_alert}` |

The `ShieldAlert` icon color changes to `branding.accent_color` via inline style.

### `frontend/src/pages/Settings.tsx` (new)

- Route: `/settings`
- Only accessible to `data_engineer` role (added to their `nav` array in `RoleContext.tsx` and as a route in `App.tsx`).
- Form fields: Program Name, Agency Name, State, Tagline, Accent Color (native `<input type="color">`), Footer Alert.
- Live preview panel showing the sidebar header as it will appear after save.
- Save button calls `PUT /api/settings/config` and updates `BrandingContext` on success.
- Error state shown inline if the save fails.

### `frontend/src/context/RoleContext.tsx` (update)

Add `/settings` to the `data_engineer` role's `nav` array.

### `frontend/src/App.tsx` (update)

Add `<Route path="/settings" element={<Settings />} />`.

---

## Local Dev Fallback

When `IS_DATABRICKS_APP` is `False`, `config_store` reads/writes `data/app_config.json`. Add `data/app_config.json` to `.gitignore` so agency-specific config doesn't land in the repo.

---

## Out of Scope

- Logo image upload (future: upload to Volume, reference by URL)
- Role name/permission configurability
- Data source (catalog/schema/table) configurability
- Auth guard on the settings API endpoint (relies on frontend role-gating only)
