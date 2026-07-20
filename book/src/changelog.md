# Changelog

All notable changes to the AIPage extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0](https://codeberg.org/dasmatus/aipage/compare/v1.4.0...v1.5.0) (2026-02-08)


### ♻️ Code Refactoring

* modularize GitLab CI configuration by splitting it into multiple included YAML files. ([9188424](https://codeberg.org/dasmatus/aipage/commit/918842476dc9e9cb6d5c5fbe2d3c5ab0fbfdfe1d))
* Remove `./` prefix from internal markdown links in SUMMARY.md. ([e50baf8](https://codeberg.org/dasmatus/aipage/commit/e50baf88bcbe792947980b688520fe440d5b2588))
* Remove OCR functionality, its component, tests, i18n strings, and dependencies; add test fixtures. ([f97a838](https://codeberg.org/dasmatus/aipage/commit/f97a838efa2a0e717cf87431ab824aa56bdf88be))
* Rename project and branding from 'EduPage AI' to 'AIPage' across documentation, manifests, and UI components. ([fb7f9e7](https://codeberg.org/dasmatus/aipage/commit/fb7f9e72266de8ce114f0d3b26d426016a20d6b2))
* Replace `npx` with `bunx` for script execution, remove Node.js from CI, and update Playwright types. ([d04d4d7](https://codeberg.org/dasmatus/aipage/commit/d04d4d788051c50556a9035350ce6d3b7b906756))


### 📚 Documentation

* add 1.4.0 release notes to changelog. ([6daf19b](https://codeberg.org/dasmatus/aipage/commit/6daf19b2298c63072e014bc29a9d41e973b93b24))
* Remove redundant `./` from internal links in introduction.md. ([1231fc5](https://codeberg.org/dasmatus/aipage/commit/1231fc59955b4cf3f26acb7cc056a6172f1147f2))
* Update installation guide to use pre-built releases and switch to absolute links in the summary. ([1f8fec8](https://codeberg.org/dasmatus/aipage/commit/1f8fec8839de4d11dd2bd00e7beed5a764ad3975))
* Update installation instructions to download CI build artifacts and remove automatic release publishing from CI. ([bb0d375](https://codeberg.org/dasmatus/aipage/commit/bb0d375eab5f5d3980368e1ad694f61d890299dd))


### 👷 CI/CD

* Add `before_script` to install `zip` package for CI packaging. ([f3414a6](https://codeberg.org/dasmatus/aipage/commit/f3414a63492eee781b2212dd04f63fe3d88f44ea))
* Reduce CI artifact expiration for node_modules from 1 hour to 5 minutes. ([d4a78b3](https://codeberg.org/dasmatus/aipage/commit/d4a78b3f70f8e7dfd6ce4f1ebdebca2ac3af94ad))
* Remove testing from the CI pipeline and migrate documentation generation to mdbook. ([0cca947](https://codeberg.org/dasmatus/aipage/commit/0cca947f21edb7e4ba34d5d0fb23578eb16d22db))
* Update test command, remove Playwright installation, reduce test artifact expiration, and standardize GitLab token variable. ([d2ea9c8](https://codeberg.org/dasmatus/aipage/commit/d2ea9c8e7b7c39d89da5dabd93bc295f8024836e))


### 🔧 Chores

* Enhance type safety by introducing the `PageContentResponse` interface and adding explicit types to OCR-related functions. ([eaae3d5](https://codeberg.org/dasmatus/aipage/commit/eaae3d574534cecf1cc9efc5f2ff6390b5b8941a))
* remove old test result files ([45d0b7d](https://codeberg.org/dasmatus/aipage/commit/45d0b7d5a99261ed4f963861156bd175fee931eb))
* Update CI to run on merge requests and include a cache, remove README processing from the documentation build script, and fix the contribution guide link in the user guide. ([a62ccd8](https://codeberg.org/dasmatus/aipage/commit/a62ccd8ff7b48521d518cec8cda38a2115413d73))


### ✅ Tests

* Add unit tests for sidebar App, MessageList, and SettingsView components and update user guide with Manifest V2 compatibility. ([87a4a6a](https://codeberg.org/dasmatus/aipage/commit/87a4a6a952bf08fb236ddbcb546a33079546c7ec))
* refactor `browser-polyfill` mock to support ES modules and include `runtime` API methods. ([4eae74f](https://codeberg.org/dasmatus/aipage/commit/4eae74f4bddb6e8e9c9999c32ff06b52d42fb691))


### ✨ Features

* Add 'send' button internationalization and accessibility labels; chore: Remove `build:test` dependency from GitLab CI changelog job. ([b48a16a](https://codeberg.org/dasmatus/aipage/commit/b48a16a0586e4004e8725a992deafe03794c7e78))
* add Gemini API key creation troubleshooting link to settings and update user guide documentation. ([9e3af49](https://codeberg.org/dasmatus/aipage/commit/9e3af4962c7c7007ed0883be36eb1c9b6086c259))
* Configure Jest with JSDOM and Chrome API mocks for extension testing, and refine GitLab CI/CD pipeline jobs and dependencies. ([6bfe621](https://codeberg.org/dasmatus/aipage/commit/6bfe62106ed79d288086bdd6bb808a8348cb86d0))
* enhance Playwright testing infrastructure with improved browser API mocking and add tests for sidebar initialization and API key management. ([0e79027](https://codeberg.org/dasmatus/aipage/commit/0e79027569b6f03e968aab6d081214b59333f421))
* Implement auto-update functionality via GitLab and add Vercel AI SDK as an experimental provider backend. ([4ce0383](https://codeberg.org/dasmatus/aipage/commit/4ce0383a6c504ad1c4b29941ed20ba74643820cf))
* Migrate testing framework from Playwright to Jest and React Testing Library, and refine chat search action. ([d5d3863](https://codeberg.org/dasmatus/aipage/commit/d5d3863bc7fe424ab1965117526e8e516bee86d3))
* Update CI/CD job triggers for packaging and releases to run on `main` instead of `tags`, and add new changelog entries for version 1.4.0. ([4b30cc5](https://codeberg.org/dasmatus/aipage/commit/4b30cc5f4e8c6f7a75117b17b085b38f573d4c67))

## [1.4.0](https://codeberg.org/dasmatus/aipage/compare/v1.3.0...v1.4.0) (2026-02-07)


### 📚 Documentation

* add changelog file. ([691e6bc](https://codeberg.org/dasmatus/aipage/commit/691e6bc0f533d7e009e39cc5a97d29272ee3159c))


### ✨ Features

* Add changelog generation and version bumping job, and enable pages deployment on tags. ([5f12e01](https://codeberg.org/dasmatus/aipage/commit/5f12e01a1cb7bd5ec7a6faca754d3e2d7d7fb1a5))


### 👷 CI/CD

* add rule to prevent Chrome extension packaging on `chore(release):` commits. ([6208108](https://codeberg.org/dasmatus/aipage/commit/6208108923afb6c7579d6f1d0de3228c4ed40621))

## 1.3.0 (2026-02-07)


### 📚 Documentation

* add emojis to section headers in `contributing.md`. ([3c85a8b](https://codeberg.org/dasmatus/aipage/commit/3c85a8be7e7aef13a2659a4b0217ef00eda19161))
* Enhance LM Studio and Ollama setup instructions with more detailed steps and refined notes. ([6021bb6](https://codeberg.org/dasmatus/aipage/commit/6021bb67cbcb8b8563af971ada9788ee8de1a819))
* Update contribution section to refer to a dedicated contributing guide. ([6ca9249](https://codeberg.org/dasmatus/aipage/commit/6ca9249994795bb03a7deae4df9e1074b9e74672))


### 🐛 Bug Fixes

* Add version branch support to GitLab CI pipeline ([f57e040](https://codeberg.org/dasmatus/aipage/commit/f57e0409671688e4dc1d776c927cdd7a59a8d641))
* Use needs:optional for install_dependencies ([984e0d9](https://codeberg.org/dasmatus/aipage/commit/984e0d9e40d1e48721c61cc8699235ff3285c755))


### ✨ Features

* Add a default system prompt to all AI providers, inject anti-cheat bypass on test pages, and refine UI themes with updated names and styles. ([79827fd](https://codeberg.org/dasmatus/aipage/commit/79827fdf4ee3333d1d51d0a4dd1f45f7e59e4423))
* add Gemini AI developer guide and refactor sidebar styling from CSS to SCSS. ([213ce77](https://codeberg.org/dasmatus/aipage/commit/213ce778238b677e3a81ab03e96910c5fb2c837c))
* Add multi-AI provider support, refactor sidebar logic into new modules, and update documentation and tests. ([6a9f2dd](https://codeberg.org/dasmatus/aipage/commit/6a9f2dd5aa2411ac989d50ca1a521b9ac78984dd))
* Add multi-browser support for Firefox and Safari, including updated build configurations, manifests, and polyfills. ([2544b81](https://codeberg.org/dasmatus/aipage/commit/2544b816ffce3a9dda758705393ff1b824fd31f8))
* Add OCR tool to the sidebar and enhance chat context handling with new AI actions for text selections. ([e8d3585](https://codeberg.org/dasmatus/aipage/commit/e8d358522ecca60265a22a81d9276ca3fe79ae93))
* add Playwright browser path variable and cache Playwright binaries ([9efedb6](https://codeberg.org/dasmatus/aipage/commit/9efedb64e04913e732c782c11479c3b455fd61e3))
* bump extension version to 1.2.4 and adapt Safari manifest to Manifest V2 specifications. ([c7b2c28](https://codeberg.org/dasmatus/aipage/commit/c7b2c283ab76cac9456d9a5a8f76cb006f28f6fc))
* Bump version to 1.2.0, update dependencies, and remove sudo from CI apt commands. ([988408e](https://codeberg.org/dasmatus/aipage/commit/988408e91a33c32831f9523c9558e880ac0afa53))
* Display provider-specific API key setup instructions in the settings view and improve test assertions. ([26d94b1](https://codeberg.org/dasmatus/aipage/commit/26d94b1167da21ae11fcd30ab222cb6b155f865d))
* Enhance UI theming with background, header, and border colors, and ensure the AI button remains clickable when the sidebar is open. ([6473c14](https://codeberg.org/dasmatus/aipage/commit/6473c14c17cd561daf1777667a8bdc150b138781))
* Implement a new React-based sidebar with chat and settings. ([a1707d1](https://codeberg.org/dasmatus/aipage/commit/a1707d1d42e2bd4d7d1669d340f6b9d187435a0f))
* Implement automated release management and documentation generation from markdown files. ([7540c7d](https://codeberg.org/dasmatus/aipage/commit/7540c7dd2b09a3c134d07d4ca59c787b3c60aed2))
* Implement cross-browser Playwright testing and automate extension releases for Chrome, Firefox, and Safari via GitLab CI. ([8b74b73](https://codeberg.org/dasmatus/aipage/commit/8b74b73245e15d66b3661902540a34cab167679b))
* Implement image detection for page selection and OCR, add new OCR and settings tests, and enhance API response handling. ([8a82d45](https://codeberg.org/dasmatus/aipage/commit/8a82d458da7dcd010892ce0caceeee0363b2e940))
* Implement internationalization for the sidebar, update documentation with a custom theme, and add new license files. ([6c4d3f5](https://codeberg.org/dasmatus/aipage/commit/6c4d3f5a0dc29f570f3e457bcc324432e7140fe1))
* Improve API key configuration with detailed instructions, refine AI button UI, add comprehensive documentation, and implement navbar integration tests. ([ca40413](https://codeberg.org/dasmatus/aipage/commit/ca4041336782b6d9e0929c3401206e89e64799e9))
* Improve settings UI for API key and local model management, update Playwright tests, and refine build configuration. ([f949232](https://codeberg.org/dasmatus/aipage/commit/f949232faa74a802dbb920a435e25add1e94e307))
* Integrate `webextension-polyfill` for consistent storage access and add an SVG icon to the AI button. ([0f79aa4](https://codeberg.org/dasmatus/aipage/commit/0f79aa4b8f8883df3c7f462c80471aac72486678))
* Integrate AI button and adjust layout for EduPage test player interface, adding dedicated tests. ([cd2461f](https://codeberg.org/dasmatus/aipage/commit/cd2461ff9d85db529ee57714a1fd75960226d868))
* Internationalize AI provider setup instructions in the settings view by replacing hardcoded text with new translation keys. ([01a8075](https://codeberg.org/dasmatus/aipage/commit/01a8075c24e80768970e0b652b0c4b6f2b9bb4ba))
* Introduce a dedicated `install` stage and job for centralized dependency management and update other jobs to depend on it. ([d2713db](https://codeberg.org/dasmatus/aipage/commit/d2713db0d2faacc758594a832bdc1eddcdc89689))
* Introduce multiple customizable UI themes with selection and persistence. ([75ec7c3](https://codeberg.org/dasmatus/aipage/commit/75ec7c306227005dfdad0a6cc9e8eeabe0f68ac0))
* introduce page content scanning and context-aware chat actions with new tests. ([3a3d9ae](https://codeberg.org/dasmatus/aipage/commit/3a3d9aea5e46b51ec490bb8df7afe5aff7f88445))
* Redesign the sidebar UI with a new theme and refine component styling. ([22bf7d2](https://codeberg.org/dasmatus/aipage/commit/22bf7d2647206a4cffca8adc71f7e0d0db3ed471))
* Redesign TypeDoc theme to match MDBook and sidebar styles, and update repository URLs in package.json and typedoc.json. ([2ba3c15](https://codeberg.org/dasmatus/aipage/commit/2ba3c159230ac3f4212bf2a6af8399a6f0184914))
* Reintroduce contributing guide, documentation link validation, and integrate doc tests into CI pipeline. ([4c314f1](https://codeberg.org/dasmatus/aipage/commit/4c314f16c9ec8a568ca2a5b42247a9a77fe3c7e0))
* Set up ESLint. ([59be421](https://codeberg.org/dasmatus/aipage/commit/59be4216dcf5c96e06a7a4457d714d44b3a801a3))
* Set up Turbopack. ([9446656](https://codeberg.org/dasmatus/aipage/commit/94466562b798af7408eef3b9ee5835ac6353b3bc))
* Switch to Bun ([071affc](https://codeberg.org/dasmatus/aipage/commit/071affc3c09eb8d6e970ffd74c986493a42afeb7))
* Translate various UI strings to Slovak and remove the star icon from the sidebar header. ([4e777a8](https://codeberg.org/dasmatus/aipage/commit/4e777a8af5c101c8d533092ede9e0d3ebf944894))


### 🔧 Chores

* remove marked dependency from bun.lock ([edd7063](https://codeberg.org/dasmatus/aipage/commit/edd70635ecba782bb07c43d7a23c55dedfd83e95))
* remove marked dependency from package.json. ([139861c](https://codeberg.org/dasmatus/aipage/commit/139861caf75e81206611f0d846d5e6882e29d04f))
* Update sidebar's initial width and its minimum and maximum resizing boundaries. ([7b10e9a](https://codeberg.org/dasmatus/aipage/commit/7b10e9a1873a13739d0f8fc8b82d9449a1c1ec4c))


### 💎 Styles

* Remove extra space after `&&` in GitLab CI `before_script` command. ([0ca0e10](https://codeberg.org/dasmatus/aipage/commit/0ca0e10f7621ee59a6760a4ee2dd05b67c12f846))


### 👷 CI/CD

* Add cache stage and `install_dependencies` job with `bun install`. ([da12521](https://codeberg.org/dasmatus/aipage/commit/da12521fcef0b3ca13b8cf5cb45d86bbcd6d62bc))
* Add test job dependency to Firefox and Safari build stages. ([46014cd](https://codeberg.org/dasmatus/aipage/commit/46014cd873052855aea8cc26d33b1b9a0d22d2fa))
* Reduce artifact expiration to 7 days. ([9811311](https://codeberg.org/dasmatus/aipage/commit/9811311bd628c133e6fd474635c1d515f92e7da5))
* Remove 'install' stage from GitLab CI pipeline configuration. ([28d67d0](https://codeberg.org/dasmatus/aipage/commit/28d67d0028475f0060033c8a913c469ceec700e4))
* Remove `main` branch from `only` rules for packaging jobs. ([cff1d5c](https://codeberg.org/dasmatus/aipage/commit/cff1d5c2cec2fd2dea7437d13ce3ad363062f5e5))
* Trigger browser extension builds only on tags. ([3e55dcc](https://codeberg.org/dasmatus/aipage/commit/3e55dcc5f7a65baf9629ceef4c6af0b4f5f2d53a))
* Update CI image to `canary-debian` and install `nodejs`/`npm` in `before_script`. ([4009d27](https://codeberg.org/dasmatus/aipage/commit/4009d27cbf6b101c7147ddf1e53f92c8afcf5883))
* update GitLab CI/CD image to oven/bun:latest ([bfa6bb8](https://codeberg.org/dasmatus/aipage/commit/bfa6bb85f5de3434cbb6d9809405779dd8ebc84b))
* Update lint and build jobs to depend on cache instead of install_dependencies. ([1530a5f](https://codeberg.org/dasmatus/aipage/commit/1530a5fea86f1224c8dd15248010a08bfc5b8c0f))


### ♻️ Code Refactoring

* Centralize language management in settings view, update CI/CD pipeline name, and add language tests. ([156347d](https://codeberg.org/dasmatus/aipage/commit/156347ddcfc9b7aad7ee7a5026cf210d577a22eb))
* introduce browser API polyfill for storage and update test build paths for browser-specific artifacts. ([96b3211](https://codeberg.org/dasmatus/aipage/commit/96b32119b89ac4c86b18fd7ba7ad57f2d3503185))
* Migrate `App.tsx` to use `webextension-polyfill`'s `browser.tabs` API and update tests to mock the new API usage. ([e61ce94](https://codeberg.org/dasmatus/aipage/commit/e61ce943695d66499dee3bae64dee7851fc151a1))
* mock Chrome API and load extension sidebar directly via file protocol in Playwright tests.refactor: mock Chrome API and load extension sidebar directly via file protocol in Playwright tests. ([53640ed](https://codeberg.org/dasmatus/aipage/commit/53640ed1edf7ab7ff0889f7f05fdf1deebc96b69))
* Move `.hidden` utility class from `.view` to global scope. ([e1d726b](https://codeberg.org/dasmatus/aipage/commit/e1d726b13a04491a418a4871d47ddede6004c732))
* Remove dedicated `install` stage and job, inlining `bun install` into subsequent jobs. ([759c8b3](https://codeberg.org/dasmatus/aipage/commit/759c8b33340ee8d094761f686f46238902c90d45))
* Remove extraneous spaces in `apt-get update` commands and reorder `test` and `build` stages. ([0e09892](https://codeberg.org/dasmatus/aipage/commit/0e098925bb78b0f90a9263b1572c00c4dc6b1240))
* remove unused `readFileSync` and `writeFileSync` imports from build script ([889cc3f](https://codeberg.org/dasmatus/aipage/commit/889cc3f3e0a7f8f347abe78d9f0856baeedf468a))
* Reorder CI stages to run tests after builds and remove test dependency from build jobs. ([17f820b](https://codeberg.org/dasmatus/aipage/commit/17f820b14220b95784534364e58342ce8db12e3f))
