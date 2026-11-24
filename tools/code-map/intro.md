This page answers one question: **I see something in the app; which file is responsible for it?** It is for the owner, for anyone who reads or changes the code, and for AI agents that work in it. It is written by a script from the code and from a hand-kept list, so it stays true: `npm run map` writes it again, and the unit tests fail when it is out of date.

## How to find the code for something you see

Try these in order. Most searches end at step 1 or 2.

1. **Look it up by name.** The section [Where is … ?](#where-is--) lists what a person sees or does, in plain words, with the files behind it. It starts with its headings (Sidebar and shell, Settings, Player menus, Subtitles …): go to the heading first, then search (Ctrl+F) for the word you would use for the thing. A common word such as "subtitle" or "language" appears in many rows; the heading tells you which one is yours, and each row's note says what is next to it.
2. **Start from the address.** The address bar says which screen you are on. [The screens](#the-screens) gives the page file for every address. A page file is short: it names the parts the screen is made of, and each part is a file in the same folder.
3. **Start from the element itself.** Right-click the thing in the browser and choose **Inspect**. In the panel that opens, look at the highlighted element and the ones around it for an attribute that starts with `data-`, such as `data-pref-id="UserInterfaceLanguage"` or `data-player-button="settings"`. [Markers in the page](#markers-in-the-page) says which files write each one. Searching the code for the value (`UserInterfaceLanguage`) finds the exact place.
4. **Start from the words on the screen.** Every visible text has a key. Many rows of "Where is … ?" already name it. Otherwise search `src/i18n/locales/en.json` (texts the TV app also has) and `src/i18n/extra/en.json` (texts only the web has, keys starting with `web_`) for the English words, then search `src/` for the key. To change the words themselves, change them in that file.
5. **Read the folder.** [Every file of the source folder](#every-file-of-the-source-folder) lists each file with a sentence about what it does.

## Three things that save a wrong turn

- **A thing is often made of two files: where it is used and what it is built from.** A screen's own folder (under `src/features`) decides *what* is shown; the shared parts in `src/ui` decide *how* a dialog, a card, a row or a button looks and behaves everywhere. Example: the language list in Settings is opened by `src/features/settings/LanguagePreference.tsx`, and the box it sits in is the shared `src/ui/overlays/DialogPopup.tsx`. A change to how one dialog looks belongs in the first; a change to how all dialogs look belongs in the second.
- **The look is in the stylesheet beside the component.** `Name.tsx` says what is there; `Name.module.css` says its colour, size, spacing, transparency and motion. Colours are never written in a component: they come from the theme (`src/theme`).
- **An effect has no element of its own.** Something that slides, fades, grows, darkens or flashes is not a thing you can right-click. Find the element it happens to, then look in that element's stylesheet for `transition`, `animation`, `transform`, `opacity` or a `gradient`. When a thing appears and disappears, the line that decides it is in the component that places it (its parent), not in the thing itself.
- **Much of what you see is copied from the TV app on purpose.** When something looks odd, the comment at the top of its file usually says whether it follows the TV app (and where: `W/...` is a path in the TV app's source) or is a web addition. [DEVIATIONS.md](DEVIATIONS.md) lists every difference.

## Keeping this page true

- The lists of files, screens and markers are read from the code on every run. The sentence beside a file is the first sentence of the comment at its top (or on the first thing it exports): to improve a line here, improve that comment.
- The section "Where is … ?" comes from `tools/code-map/where.json` and the folder lines from `tools/code-map/folders.json`. Add a row when you add something a person can see, and when you had to search for something: the next person should not have to.
- `npm run map` writes the page; `npm run test` checks that it is current and that every file it names exists.
