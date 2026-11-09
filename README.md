# calmbook

Facebook, without the noise. It's a lightweight Android app that opens the Facebook mobile website and cleans up the feed:

- Hides ads, AI-labeled posts, Reels, videos, and posts from pages and groups you don't follow
- An open Reel stays on its own, with no swiping to the next one
- Adds a seek bar to videos that don't have one
- Links open in your browser without Facebook's tracking
- The Messages tab opens your Messenger app
- Each filter has its own switch under "Calm mode" in the Facebook menu

It doesn't patch or modify the official app. It shows the regular website (`m.facebook.com`) with display rules on top. The app never reads or stores your login, and sends no data anywhere. It's the same idea as [calmgram](https://github.com/eloi-del/calmgram), for Instagram.

![The Calm mode panel](docs/calm-mode.jpg)

## What it does

Each filter has its own switch in Calm mode. All of them are on by default. A hidden post is collapsed to 0px, along with the grey separator after it, so no grey bands are left behind.

| Switch | Behavior |
|---|---|
| Ads | Posts labeled "Sponsored" or "Ad" are hidden, in the feed and between videos in the Reels player. |
| AI content | Posts labeled "AI content" are hidden, in the feed and in the Reels player. |
| Reels | The Reels block in the feed is hidden, and so is the Reels tab icon (its spot stays blank). `/reels/` goes back to the feed. A single Reel (`/reel/ID`) still opens. |
| Videos | Posts that contain a video are hidden. |
| Suggestions | "Suggested for you" blocks are hidden, along with posts from pages and groups you don't follow (the ones with a "Follow" or "Join" button). |
| One Reel at a time | In a Reel or video opened full screen, swiping to the next one is blocked. The player is recognized by its content, not its address, because it also opens at `/<page>/videos/<id>/`. To see Reels in the feed without being able to binge them, turn "Reels" off and keep this one on. |
| Messages | The Messages tab opens the Messenger app instead of the "Get Messenger" page. |

These are always on, with no switch:

- The "Open app" bar at the bottom of the screen is hidden.
- Videos get a seek bar you can drag to move forward or back. It sits at the bottom of the video, left of the sound button. Facebook's mobile player doesn't have one. When Facebook shows its own bar, this one steps aside.
- External links open in your browser. The app skips the `l.facebook.com` redirect and strips tracking parameters (`fbclid`, `utm_*`, `gclid`, `mc_eid`…).
- The page doesn't jump back while scrolling: scroll anchoring is turned off on the feed.
- Search, notifications, groups and Marketplace are unchanged.

**Why the feed can feel slow to fill:** when most posts are hidden, Facebook has to load a lot to show a few. On a real account, about 9 posts out of 10 were ads, videos, Reels or suggestions. The script itself takes less than 1% of the work while scrolling. It only looks for the "Open app" bar once per second at most, because that search costs about 35 ms.

## Settings

- **In Facebook:** Menu (☰, top right). The **Calm mode** button is at the bottom right. It floats above the page rather than sitting in the list, because Facebook keeps redrawing its lists and a row added to them doesn't stay.
- **Shortcut:** long-press the app icon → **Calm mode**.
- The panel is in English when Facebook is in English, and in French otherwise.
- Settings are saved in the site's storage on the phone. If they're cleared, everything goes back to calm mode.
- On the phone, the app is named "Facebook" (package `fr.perso.calmbook`, with its own icon: three white lines on a blue-grey background).

## What's inside

- `app/src/main/assets/calmbook.js`: all the page rules. This is the file to fix when Facebook changes.
- `app/src/main/java/fr/perso/calmbook/MainActivity.kt`: the WebView.
- `app/src/main/java/fr/perso/calmbook/LinkCleaner.kt`: link cleaning.

**How it differs from Instagram:**

- Feed posts aren't `<article>` elements. They're `[data-tracking-duration-id]` blocks.
- Facebook empties blocks that are far off screen. Each post is classified as soon as it fills in, and its mark stays on the block.

**Your login:** the login page is Facebook's own. There is no bridge between the page and the app (`addJavascriptInterface` isn't used), so the app can't read what you type. `calmbook.js` only reads the page address, the header of feed posts and its own settings. The app only looks at the addresses the page wants to open. The one special address is `calmbook://messenger`, which opens Messenger.

**Privacy:**

- The only permission is Internet: no microphone, camera, location or contacts.
- Third-party cookies are refused inside the page.
- Your Facebook session stays inside the app. Your browser doesn't have it, so Facebook "pixels" on other websites can't link your visits to your account, unless you also log in to Facebook in your browser.
- Facebook's own internal analytics (time spent on a post, etc.) are **not** blocked. A client that never sends them would be easy to spot.

## Build and install

Same requirements as calmgram: Java 17, the Android SDK and `local.properties` (see the [calmgram README](https://github.com/eloi-del/calmgram#install-the-tools-once)). With the phone plugged in and USB debugging allowed:

```bash
./install.sh
```

To open the Calm mode panel directly:

```bash
./install.sh settings
```

After a build, Gradle stays in memory in the background. On a computer with little RAM, stop it:

```bash
./gradlew --stop
```

## Credits

No code was copied. These projects served as inspiration:

- [Nora](https://github.com/nonbili/Nora): spotting ads by the label under the author's name, and hiding the "Open app" bar.
- [FB-Mobile-Clean-my-feeds](https://github.com/webdevsk/FB-Mobile-Clean-my-feeds): the list of filters (suggestions, ads, Reels), and the warning about scroll jumps on mobile Facebook.
- [calmgram](https://github.com/eloi-del/calmgram), the Instagram app built the same way, is the base for this one.

## Disclaimer

Personal project, not affiliated with Meta, which has neither approved nor reviewed it. Instagram and Facebook are trademarks of Meta. The app shows the official website and only adds display rules on top. It doesn't modify the official app, doesn't read your login and doesn't send anything anywhere. Use it at your own risk and in line with Meta's terms of use.

## License

MIT: see [LICENSE](LICENSE).
