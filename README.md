# Northline Studio — Invoices & Quotes

An invoicing app for a freelancer or small studio. Plain HTML, CSS and JavaScript in six files. No installation, no server, no internet required.

## How to open
1. Keep all files (`index.html`, `style.css`, `data.js`, `core.js`, `ui.js`, `app.js`) in the same folder.
2. Double-click `index.html` to open it in Chrome, Edge, Firefox or Safari.
3. The app starts with sample data: 12 months of invoices and quotes for seven clients in USD, EUR and GBP.

## Everyday use
- **New invoice** (`N`) or **New quote** (`Q`): edit on the left, and the real document updates on the right as you type.
- **Issue** gives the document its number and freezes it. Drafts have no number and can be deleted.
- **Record payment** on an invoice. When it is fully paid, the PAID stamp lands on the page.
- **Create credit note** to correct an issued invoice. If credits exceed what was owed, record the refund.
- **Convert to invoice** turns a sent or accepted quote into a draft invoice.
- **Repeat** creates a recurring schedule for retainers. It prepares drafts for you to review.
- **Remind** writes a friendly, firm or final reminder you can copy or open in your email app.

## Saving a PDF
Click **Download PDF**, choose **Save as PDF**, set margins to **Default** or **None**, and turn off **Headers and footers**. Only the document is printed. Email apps can't attach the PDF automatically, so attach the saved file yourself.

## Continuing your numbering
Coming from another tool? In **Settings → Numbering**, set the next invoice number. Numbers look like `INV-2026-0148` and restart each year.

## Good to know
- Issued documents keep a copy of your business and client details from the day they were issued. The logo is the exception: documents always show your current logo.
- Each document has its own currency. Totals are never added across currencies.
- Reports show invoiced, collected, outstanding, aging, top clients and a tax report per rate, for each currency.

## Check the calculations
Open `index.html?selftest` and look at the browser console (F12). Six built-in tests check exclusive and inclusive tax, a zero-decimal currency, payments and credit notes, numbering and recurring invoices.

## Back up your data
Data is saved automatically in this browser only. Use **Settings → Export backup** regularly and **Import backup** to restore it.
