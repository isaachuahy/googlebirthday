# 🎂 Google Birthday Populator

A Google Apps Script web app that helps you add or update birthdays in your Google Contacts. Search for contacts by name, add or edit their birthday, or create new contacts—all from a simple web interface.

## Features

- **Contact search** — Find contacts by name with exact and fuzzy matching (Levenshtein distance)
- **Add birthdays** — Set birthday for contacts that don't have one
- **Update birthdays** — Add missing year or change existing birthday (with conflict handling)
- **Create new contacts** — Add a new contact with a name and birthday when no match is found
- **Conflict resolution** — Warns when updating would overwrite an existing birthday; optional force overwrite

## Requirements

- A Google account with [Google Contacts](https://contacts.google.com)
- Google Apps Script deployment access

## Setup

### 1. Create a New Google Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Create a new project
3. Add the People API:
   - Go to **Extensions** → **Advanced Google services**
   - Enable **Google People API**
   - Ensure the People API is also enabled in the [Google Cloud Console](https://console.cloud.google.com) under APIs & Services

### 2. Add the Files

- Create `Code.gs` and paste the contents from `Code.gs`
- Create `Index.html` and paste the contents from `Index.html`

### 3. Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Select type **Web app**
3. Set **Execute as**: "Me"
4. Set **Who has access**: "Anyone" (if you want to access it outside your account) or "Only myself"
5. Authorize the app when prompted (Google Contacts read/write access)
6. Copy the web app URL

## Usage

1. Open the deployed web app URL
2. Enter a contact name in the **Name** field
3. Select the birthday in the **Birthday** date picker
4. Click **Search & Process**

The app will:

- **Exact match** — If one contact matches, it updates automatically. If multiple match, you pick from the list.
- **Fuzzy match** — If no exact match, shows up to 5 closest name matches for you to choose from.
- **No match** — Offers to create a new contact with that name and birthday.

### Conflict Handling

If a contact already has a different birthday, the app will show a conflict and ask whether to overwrite.

## Project Structure

```
googlebirthday/
├── Code.gs      # Apps Script backend (People API calls, search/update logic)
├── Index.html   # Web UI (HTML, CSS, JavaScript)
└── README.md
```

## API Reference

Uses the [Google People API](https://developers.google.com/people/api/rest/v1/) for:

- `People.Connections.list` — Fetch contacts (names, birthdays, emails, organizations)
- `People.get` — Fetch a single contact
- `People.updateContact` — Update contact birthday
- `People.createContact` — Create a new contact

## License

MIT
