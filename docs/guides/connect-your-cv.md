# Create or connect your CV

Your actual Codex or Claude Code client reads your authorized CV to match roles to real experience. Tawdheef keeps local guidance and results. A real readable CV is required for matching decisions; you can browse and organise directories without one.

## If you do not have a Tabbio CV

1. [Create your free digital CV on Tabbio](https://app.tabbio.com?utm_source=tawdheef&utm_medium=guide&utm_campaign=connect_cv).
2. Add or import your real experience, education and skills. Review and save the CV you want your agent to use.
3. Return to **Connections → Tabbio CV** and copy its setup request into your selected client.

Tabbio’s free plan lets you build and share your digital CV and export a PDF. Your setup agent can help with your real information; it should ask about missing facts rather than invent them.

## Connect an existing CV

1. Open **Connections → Tabbio CV** in Tawdheef and choose **Copy setup request**.
2. Paste it into your selected Codex or Claude Code chat. Reuse an existing Tabbio connection before adding another.
3. If missing, add the published Tabbio remote MCP endpoint to that client's supported project settings and complete its normal sign-in/consent flow. `npm run agent -- codex --tabbio` prepares the project entry; use `claude-code` for that client.
4. Let the client read the actual CV and report only its source/update metadata through `report_native_connection`. The app labels this **Client reported**, with the observation time.

If the read fails, finish the client's sign-in or access step and check again. Saved configuration is not a successful read. Tawdheef does not own a second Tabbio session or cache native CV contents.

## Keep the current version available

Update your CV in Tabbio when your experience changes. Your client uses the [Tabbio MCP or CLI](https://www.tabbio.com/en/mcp?utm_source=tawdheef&utm_medium=guide&utm_campaign=cv_tools) tools actually available to that account. Reading a CV never authorizes editing, publishing, changing visibility or sharing it. Original PDF/DOCX uploads need real source files; the optional local original-file picker does not verify facts or manufacture a CV.

## Expected result

Your client can read the real CV and Tawdheef shows dated source metadata. Private CV contents remain with the client's connection rather than being pasted into directory records.
