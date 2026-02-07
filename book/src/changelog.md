# Changelog

All notable changes to the AIPage extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.3.0 (2026-02-07)


### 📚 Documentation

* add emojis to section headers in `contributing.md`. ([3c85a8b](https://gitlab.com/TenTypekMatus/aipage/commit/3c85a8be7e7aef13a2659a4b0217ef00eda19161))
* Enhance LM Studio and Ollama setup instructions with more detailed steps and refined notes. ([6021bb6](https://gitlab.com/TenTypekMatus/aipage/commit/6021bb67cbcb8b8563af971ada9788ee8de1a819))
* Update contribution section to refer to a dedicated contributing guide. ([6ca9249](https://gitlab.com/TenTypekMatus/aipage/commit/6ca9249994795bb03a7deae4df9e1074b9e74672))


### 🐛 Bug Fixes

* Add version branch support to GitLab CI pipeline ([f57e040](https://gitlab.com/TenTypekMatus/aipage/commit/f57e0409671688e4dc1d776c927cdd7a59a8d641))
* Use needs:optional for install_dependencies ([984e0d9](https://gitlab.com/TenTypekMatus/aipage/commit/984e0d9e40d1e48721c61cc8699235ff3285c755))


### ✨ Features

* Add a default system prompt to all AI providers, inject anti-cheat bypass on test pages, and refine UI themes with updated names and styles. ([79827fd](https://gitlab.com/TenTypekMatus/aipage/commit/79827fdf4ee3333d1d51d0a4dd1f45f7e59e4423))
* add Gemini AI developer guide and refactor sidebar styling from CSS to SCSS. ([213ce77](https://gitlab.com/TenTypekMatus/aipage/commit/213ce778238b677e3a81ab03e96910c5fb2c837c))
* Add multi-AI provider support, refactor sidebar logic into new modules, and update documentation and tests. ([6a9f2dd](https://gitlab.com/TenTypekMatus/aipage/commit/6a9f2dd5aa2411ac989d50ca1a521b9ac78984dd))
* Add multi-browser support for Firefox and Safari, including updated build configurations, manifests, and polyfills. ([2544b81](https://gitlab.com/TenTypekMatus/aipage/commit/2544b816ffce3a9dda758705393ff1b824fd31f8))
* Add OCR tool to the sidebar and enhance chat context handling with new AI actions for text selections. ([e8d3585](https://gitlab.com/TenTypekMatus/aipage/commit/e8d358522ecca60265a22a81d9276ca3fe79ae93))
* add Playwright browser path variable and cache Playwright binaries ([9efedb6](https://gitlab.com/TenTypekMatus/aipage/commit/9efedb64e04913e732c782c11479c3b455fd61e3))
* bump extension version to 1.2.4 and adapt Safari manifest to Manifest V2 specifications. ([c7b2c28](https://gitlab.com/TenTypekMatus/aipage/commit/c7b2c283ab76cac9456d9a5a8f76cb006f28f6fc))
* Bump version to 1.2.0, update dependencies, and remove sudo from CI apt commands. ([988408e](https://gitlab.com/TenTypekMatus/aipage/commit/988408e91a33c32831f9523c9558e880ac0afa53))
* Display provider-specific API key setup instructions in the settings view and improve test assertions. ([26d94b1](https://gitlab.com/TenTypekMatus/aipage/commit/26d94b1167da21ae11fcd30ab222cb6b155f865d))
* Enhance UI theming with background, header, and border colors, and ensure the AI button remains clickable when the sidebar is open. ([6473c14](https://gitlab.com/TenTypekMatus/aipage/commit/6473c14c17cd561daf1777667a8bdc150b138781))
* Implement a new React-based sidebar with chat and settings. ([a1707d1](https://gitlab.com/TenTypekMatus/aipage/commit/a1707d1d42e2bd4d7d1669d340f6b9d187435a0f))
* Implement automated release management and documentation generation from markdown files. ([7540c7d](https://gitlab.com/TenTypekMatus/aipage/commit/7540c7dd2b09a3c134d07d4ca59c787b3c60aed2))
* Implement cross-browser Playwright testing and automate extension releases for Chrome, Firefox, and Safari via GitLab CI. ([8b74b73](https://gitlab.com/TenTypekMatus/aipage/commit/8b74b73245e15d66b3661902540a34cab167679b))
* Implement image detection for page selection and OCR, add new OCR and settings tests, and enhance API response handling. ([8a82d45](https://gitlab.com/TenTypekMatus/aipage/commit/8a82d458da7dcd010892ce0caceeee0363b2e940))
* Implement internationalization for the sidebar, update documentation with a custom theme, and add new license files. ([6c4d3f5](https://gitlab.com/TenTypekMatus/aipage/commit/6c4d3f5a0dc29f570f3e457bcc324432e7140fe1))
* Improve API key configuration with detailed instructions, refine AI button UI, add comprehensive documentation, and implement navbar integration tests. ([ca40413](https://gitlab.com/TenTypekMatus/aipage/commit/ca4041336782b6d9e0929c3401206e89e64799e9))
* Improve settings UI for API key and local model management, update Playwright tests, and refine build configuration. ([f949232](https://gitlab.com/TenTypekMatus/aipage/commit/f949232faa74a802dbb920a435e25add1e94e307))
* Integrate `webextension-polyfill` for consistent storage access and add an SVG icon to the AI button. ([0f79aa4](https://gitlab.com/TenTypekMatus/aipage/commit/0f79aa4b8f8883df3c7f462c80471aac72486678))
* Integrate AI button and adjust layout for EduPage test player interface, adding dedicated tests. ([cd2461f](https://gitlab.com/TenTypekMatus/aipage/commit/cd2461ff9d85db529ee57714a1fd75960226d868))
* Internationalize AI provider setup instructions in the settings view by replacing hardcoded text with new translation keys. ([01a8075](https://gitlab.com/TenTypekMatus/aipage/commit/01a8075c24e80768970e0b652b0c4b6f2b9bb4ba))
* Introduce a dedicated `install` stage and job for centralized dependency management and update other jobs to depend on it. ([d2713db](https://gitlab.com/TenTypekMatus/aipage/commit/d2713db0d2faacc758594a832bdc1eddcdc89689))
* Introduce multiple customizable UI themes with selection and persistence. ([75ec7c3](https://gitlab.com/TenTypekMatus/aipage/commit/75ec7c306227005dfdad0a6cc9e8eeabe0f68ac0))
* introduce page content scanning and context-aware chat actions with new tests. ([3a3d9ae](https://gitlab.com/TenTypekMatus/aipage/commit/3a3d9aea5e46b51ec490bb8df7afe5aff7f88445))
* Redesign the sidebar UI with a new theme and refine component styling. ([22bf7d2](https://gitlab.com/TenTypekMatus/aipage/commit/22bf7d2647206a4cffca8adc71f7e0d0db3ed471))
* Redesign TypeDoc theme to match MDBook and sidebar styles, and update repository URLs in package.json and typedoc.json. ([2ba3c15](https://gitlab.com/TenTypekMatus/aipage/commit/2ba3c159230ac3f4212bf2a6af8399a6f0184914))
* Reintroduce contributing guide, documentation link validation, and integrate doc tests into CI pipeline. ([4c314f1](https://gitlab.com/TenTypekMatus/aipage/commit/4c314f16c9ec8a568ca2a5b42247a9a77fe3c7e0))
* Set up ESLint. ([59be421](https://gitlab.com/TenTypekMatus/aipage/commit/59be4216dcf5c96e06a7a4457d714d44b3a801a3))
* Set up Turbopack. ([9446656](https://gitlab.com/TenTypekMatus/aipage/commit/94466562b798af7408eef3b9ee5835ac6353b3bc))
* Switch to Bun ([071affc](https://gitlab.com/TenTypekMatus/aipage/commit/071affc3c09eb8d6e970ffd74c986493a42afeb7))
* Translate various UI strings to Slovak and remove the star icon from the sidebar header. ([4e777a8](https://gitlab.com/TenTypekMatus/aipage/commit/4e777a8af5c101c8d533092ede9e0d3ebf944894))


### 🔧 Chores

* remove marked dependency from bun.lock ([edd7063](https://gitlab.com/TenTypekMatus/aipage/commit/edd70635ecba782bb07c43d7a23c55dedfd83e95))
* remove marked dependency from package.json. ([139861c](https://gitlab.com/TenTypekMatus/aipage/commit/139861caf75e81206611f0d846d5e6882e29d04f))
* Update sidebar's initial width and its minimum and maximum resizing boundaries. ([7b10e9a](https://gitlab.com/TenTypekMatus/aipage/commit/7b10e9a1873a13739d0f8fc8b82d9449a1c1ec4c))


### 💎 Styles

* Remove extra space after `&&` in GitLab CI `before_script` command. ([0ca0e10](https://gitlab.com/TenTypekMatus/aipage/commit/0ca0e10f7621ee59a6760a4ee2dd05b67c12f846))


### 👷 CI/CD

* Add cache stage and `install_dependencies` job with `bun install`. ([da12521](https://gitlab.com/TenTypekMatus/aipage/commit/da12521fcef0b3ca13b8cf5cb45d86bbcd6d62bc))
* Add test job dependency to Firefox and Safari build stages. ([46014cd](https://gitlab.com/TenTypekMatus/aipage/commit/46014cd873052855aea8cc26d33b1b9a0d22d2fa))
* Reduce artifact expiration to 7 days. ([9811311](https://gitlab.com/TenTypekMatus/aipage/commit/9811311bd628c133e6fd474635c1d515f92e7da5))
* Remove 'install' stage from GitLab CI pipeline configuration. ([28d67d0](https://gitlab.com/TenTypekMatus/aipage/commit/28d67d0028475f0060033c8a913c469ceec700e4))
* Remove `main` branch from `only` rules for packaging jobs. ([cff1d5c](https://gitlab.com/TenTypekMatus/aipage/commit/cff1d5c2cec2fd2dea7437d13ce3ad363062f5e5))
* Trigger browser extension builds only on tags. ([3e55dcc](https://gitlab.com/TenTypekMatus/aipage/commit/3e55dcc5f7a65baf9629ceef4c6af0b4f5f2d53a))
* Update CI image to `canary-debian` and install `nodejs`/`npm` in `before_script`. ([4009d27](https://gitlab.com/TenTypekMatus/aipage/commit/4009d27cbf6b101c7147ddf1e53f92c8afcf5883))
* update GitLab CI/CD image to oven/bun:latest ([bfa6bb8](https://gitlab.com/TenTypekMatus/aipage/commit/bfa6bb85f5de3434cbb6d9809405779dd8ebc84b))
* Update lint and build jobs to depend on cache instead of install_dependencies. ([1530a5f](https://gitlab.com/TenTypekMatus/aipage/commit/1530a5fea86f1224c8dd15248010a08bfc5b8c0f))


### ♻️ Code Refactoring

* Centralize language management in settings view, update CI/CD pipeline name, and add language tests. ([156347d](https://gitlab.com/TenTypekMatus/aipage/commit/156347ddcfc9b7aad7ee7a5026cf210d577a22eb))
* introduce browser API polyfill for storage and update test build paths for browser-specific artifacts. ([96b3211](https://gitlab.com/TenTypekMatus/aipage/commit/96b32119b89ac4c86b18fd7ba7ad57f2d3503185))
* Migrate `App.tsx` to use `webextension-polyfill`'s `browser.tabs` API and update tests to mock the new API usage. ([e61ce94](https://gitlab.com/TenTypekMatus/aipage/commit/e61ce943695d66499dee3bae64dee7851fc151a1))
* mock Chrome API and load extension sidebar directly via file protocol in Playwright tests.refactor: mock Chrome API and load extension sidebar directly via file protocol in Playwright tests. ([53640ed](https://gitlab.com/TenTypekMatus/aipage/commit/53640ed1edf7ab7ff0889f7f05fdf1deebc96b69))
* Move `.hidden` utility class from `.view` to global scope. ([e1d726b](https://gitlab.com/TenTypekMatus/aipage/commit/e1d726b13a04491a418a4871d47ddede6004c732))
* Remove dedicated `install` stage and job, inlining `bun install` into subsequent jobs. ([759c8b3](https://gitlab.com/TenTypekMatus/aipage/commit/759c8b33340ee8d094761f686f46238902c90d45))
* Remove extraneous spaces in `apt-get update` commands and reorder `test` and `build` stages. ([0e09892](https://gitlab.com/TenTypekMatus/aipage/commit/0e098925bb78b0f90a9263b1572c00c4dc6b1240))
* remove unused `readFileSync` and `writeFileSync` imports from build script ([889cc3f](https://gitlab.com/TenTypekMatus/aipage/commit/889cc3f3e0a7f8f347abe78d9f0856baeedf468a))
* Reorder CI stages to run tests after builds and remove test dependency from build jobs. ([17f820b](https://gitlab.com/TenTypekMatus/aipage/commit/17f820b14220b95784534364e58342ce8db12e3f))
