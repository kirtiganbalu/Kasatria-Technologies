# 3D People Visualization

This is my preliminary assignment for Kasatria (Junior Software Developer). It is based on the three.js `css3d_periodictable` demo. After logging in with Google, the page reads people data from a Google Sheet and shows each person as a 3D tile.

## What it does

- Login with Google (Sign in with Google button)
- Reads the data from my Google Sheet (200 people from the CSV file)
- Each tile shows country, age, photo, name and interest
- Tile colour is based on net worth:
  - Red: below $100K
  - Orange: above $100K
  - Green: above $200K
- 4 layouts (use the buttons at the bottom):
  - Table (20 x 10)
  - Sphere
  - Helix (double helix)
  - Grid (5 x 4 x 10)
- Drag the mouse to rotate, scroll to zoom

## Files

- `index.html` - the page (login card, buttons, legend)
- `style.css` - styling for the login card and tiles
- `script.js` - Google login, loading the sheet data, creating the tiles and the layouts

## Libraries used

- three.js (CSS3DRenderer, OrbitControls)
- tween.js (animation between layouts)
- Google Identity Services (login)

## How to run on my computer (XAMPP)

1. Copy the project folder into `C:\xampp\htdocs\` (for example `htdocs\Kasatria Technologies`)
2. Start Apache in the XAMPP Control Panel
3. Open `http://localhost/Kasatria%20Technologies/` in the browser
4. Click **Sign in with Google**

## Google setup

1. Create a project in Google Cloud Console and enable the **Google Sheets API**
2. Set up the OAuth consent screen and add the test users (my email and lisa@kasatria.com)
3. Create an **OAuth client ID** (Web application) and add these under Authorized JavaScript origins:
   - `http://localhost`
   - `https://kirtiganbalu.github.io`
4. Put the Client ID and the Sheet ID in the top of `script.js`
5. Share the Google Sheet with lisa@kasatria.com

## Deploy (GitHub Pages)

1. Upload the files to a GitHub repository
2. Go to Settings > Pages and choose the `main` branch
3. The page will be at `https://kirtiganbalu.github.io/Kasatria-Technologies/`

## Notes

- The app is in Google "Testing" mode, so only the added test users can sign in
- Google login does not work if the page is opened as a file (`file://`), it must be opened through `http://localhost` or the GitHub link
