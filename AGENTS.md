# Chatwoot Development Guidelines

`CLAUDE.md` is a symlink to this file. Keep shared, repository-wide instructions here and detailed procedures in linked docs. Add nested `AGENTS.md` files only for subtree-specific differences; avoid duplicating root rules.

## Build, Test, and Lint

- **Ruby setup**: Use the version in `.ruby-version` through `rbenv`. Before Ruby commands, run `eval "$(rbenv init -)"`; use `bundle exec` for Rails, RSpec, and RuboCop.
- **Install dependencies**: `bundle install && pnpm install`
- **Run development**: `pnpm dev` or `overmind start -f Procfile.dev`
- **Lint Ruby**: `bundle exec rubocop <changed Ruby files>`; use autocorrection only when intended and inspect its diff.
- **Lint JS/Vue**: `pnpm exec eslint <changed JS/Vue files>`; `pnpm eslint` checks the full frontend.
- **Test Ruby**: `bundle exec rspec spec/path/to/file_spec.rb` (append `:LINE_NUMBER` for one example).
- **Test JS**: `pnpm test <test path>` or `pnpm test:watch`.
- **Seed data**: `bundle exec rails db:seed` for minimal data; `bundle exec rails search:setup_test_data` for search/load scenarios. For richer account data, Super Admin → Accounts → Seed enqueues `Internal::SeedAccountJob`, which uses `Seeders::AccountSeeder`.

## Readability and Scope

- Prefer the smallest production-ready change that solves the current problem. Build for supported callers and realistic production workloads; do not add speculative abstractions, guards, fallbacks, retries, or one-in-a-million edge cases.
- Optimize for understanding on the first read. Use descriptive names, explicit control flow, and ordinary multiline methods/functions. Avoid Ruby endless methods (`def value = expression`), semicolon-packed bodies, and compressed JavaScript functions; do not shorten code merely to fit line or class limits.
- Extract helpers or split files/classes when they clarify responsibilities or remove meaningful complexity. Avoid one-use helpers that only rename an obvious expression.
- Follow RuboCop and ESLint. Refactor responsibilities when size/complexity limits expose a problem; do not disable cops or exclude files to avoid that work. Any unavoidable suppression must be narrowly scoped and explain why the compliant approach is unsuitable.
- Do not introduce `Thread.new` or monotonic-clock APIs such as `Process.clock_gettime(Process::CLOCK_MONOTONIC)` unless necessary and explicitly approved by the user. Prefer existing job/concurrency patterns.
- Remove dead code and superseded implementations; do not keep alternate versions or commented-out logic.

## Dependencies

- Add an npm package, Ruby gem, or other dependency only when necessary. Reuse existing maintained dependencies, standard-library capabilities, or shared utilities first; explain why they or a small, maintainable implementation cannot reasonably meet the requirement.
- Before adding a dependency, verify current upstream maintenance, release activity, community/support health, and security advisories and patch responsiveness. Do not introduce abandoned or unmaintained packages. Prefer a small, readable implementation for behavior we can reasonably own; continue to use maintained, proven libraries for protocol, authentication, and signing rather than hand-rolling them.
- Before upgrading, read release notes, changelogs, and migration guides across the full version jump. Audit every call site, wrapper, configuration, and indirect integration, including framework usage and affected OSS/Enterprise paths, for changed APIs, defaults, error behavior, and deprecations. Update affected code and tests together.
- Verify runtime/framework, peer, and transitive dependency compatibility; inspect manifest and lockfile changes for unintended upgrades. Run focused behavior and integration checks across all affected surfaces to establish compatibility. A successful install or a minor/patch version label is not sufficient evidence that an upgrade is safe.

## Rails, Validation, and Database Queries

- Follow RuboCop (including the 150-character line limit). Use compact namespace declarations such as `class Foo::Bar`, while keeping method bodies multiline.
- Use idiomatic model methods, associations, scopes, and named route helpers. Keep reusable queries and relationship traversal in models/scopes; return an ActiveRecord relation when callers need further filtering or ordering.
- Controllers coordinate requests and responses. Keep request-specific URL generation and presentation in controllers or view helpers.
- Enforce stored-value rules in model validations or existing JSON/JSONB schema validators so all ordinary write paths share them. Do not duplicate the same check in controllers. Validate transient filters, lookups, and service arguments at the request boundary before queries/services use them. Use strong params and existing errors so invalid input returns `422 Unprocessable Entity`.
- Accept only documented input types, shapes, and values. Fix malformed official clients instead of adding compatibility coercions.
- Prefer model-level constraints, associations, and callbacks over new database constraints. Add a database constraint only for a demonstrated integrity need that code-level enforcement cannot adequately cover. For foreign keys, check deletion behavior and production migration/locking risks; existing constraints are not a reason to add more.
- Write application queries, joins, and data migrations with ActiveRecord and Arel. Do not add raw SQL strings, SQL heredocs, `execute`, or raw SQL hidden inside `Arel.sql` to production paths. Keep raw SQL confined to temporary diagnostic or operational scripts; use Rails migration APIs for schema changes.
- Design queries and joins for production scale: use tenant-scoped predicates, appropriate indexes and column order, bounded results/batches, and preloading where needed. Check join cardinality, duplicate rows, N+1 queries, and costly counts/sorts. For material query changes, inspect generated SQL and representative query plans; a small fixture database is not performance evidence.
- Generate migrations with `bundle exec rails g migration <Name>` so their versions are real timestamps. Do not hand-write or round migration versions.
- Enforce eligibility/exclusivity at the earliest shared entry point. Add another guard only for a real independent path that bypasses it.
- Fail visibly for invalid required configuration or impossible setup states. Use required reads (`find`, `find_by!`, required hash keys) for locked/internal configuration; do not silently skip behavior. Add checks only when they meaningfully change behavior, and use existing custom exceptions in `lib/custom_exceptions/` where appropriate.

## Tests and Validation

- Add or update meaningful tests for customer-facing behavior and underlying model, service, job, API, or state changes. Cover the intended success path and relevant failures, permissions, and lifecycle transitions; use enough coverage to establish the behavior, not just the implementation shape.
- For new or changed functionality, map and test every affected surface and consumer, including dashboard, widget/SDKs, APIs, jobs, integrations, real-time events, and OSS/Enterprise paths where relevant. Include shared behavior outside the edited files. Explicitly check whether Super Admin screens, configuration, permissions, or management actions need corresponding changes, and implement and test them when required.
- For a bug fix, add a focused regression that fails for the original behavior and passes with the fix. For core/Enterprise changes, cover the affected edition paths.
- Avoid tests that merely repeat migration declarations, configuration, formatting, or other mechanical changes. Test migration/backfill transformations when they carry meaningful data behavior, and verify operational migration safety separately.
- Run focused specs and linters after code changes. For documentation-only changes, check formatting, links, and the diff. Report checks actually run and any remaining validation gaps.
- Prefer `let` values and direct per-example setup; introduce custom spec helpers only when they remove meaningful repetition or complexity.
- Use `with_modified_env` rather than stubbing `ENV`. In parallel/reloading specs, prefer comparing `error.class.name` over constant class equality when asserting raised errors.
- Keep review-only work read-only unless changes are requested. Use existing specs or temporary probes and report missing regression coverage.

## Code Review Rules

- Apply these checks during implementation and PR review. Report concrete regressions on supported paths, with the trigger, impact, and evidence; distinguish intended behavior from defects. Leave formatting and lint-only findings to CI.
- Name the affected behavior and trace entry points, source of truth, side effects, and consumers across APIs, jobs, supported clients, and Enterprise overlays.
- Inspect unchanged helpers reached by new callers or defaults. Treat valid `false` configuration distinctly from missing values; check repeated reads, cache invalidation, and disabled-feature work.
- Bound database/Redis work, fanout, retries, scheduled jobs, and lock/connection hold time at representative production scale. Green unit tests or the existence of an index do not establish capacity.
- Exercise relevant sequences such as failure → success → failure, new events while quota-held, clock boundaries, and rollback with existing state. Assert exact required values, not merely that something changed.
- Carry deferred concerns through stacked PRs and review the assembled feature when activated. Include scheduled jobs, cached values, and persisted state in rollback/recovery reasoning.
- Review the exact PR head and complete relevant discussion; recheck affected findings if the head changes. A resolved thread is not proof that the failure was fixed.
- Give material findings a failure scenario, disposition, and evidence. Keep the approval/verdict consistent with open blockers. An accepted risk needs an explicit owner, rationale, mitigation, and follow-up or activation condition.
- Read the relevant sections of [Production Reliability](docs/production-reliability.md) when changes affect hot paths, queries, caches, fanout, quotas/retries, recovery, middleware/provider boundaries, or rollout state. Apply checks to actual risks; small changes do not need every protocol.

## Frontend and Styling

- Use Vue Composition API with `<script setup>` at the top, PascalCase component names, camelCase events, and `defineProps` declarations with appropriate types/validation.
- Use existing design-system utilities and shared composables. Use `components-next/` for message bubbles; older message-bubble components are being deprecated.
- Use Tailwind utilities; do not introduce custom/scoped CSS or inline styles. Refer to `tailwind.config.js` for colors and use existing typography utilities.
- Use logical utilities (`ms`, `me`, `start`, `end`) for direction-aware layouts. Use `rem` for arbitrary CSS dimensions, preserving native numeric values required by chart/SVG APIs.
- Extract repeated or domain-specific strings, thresholds, colors, and durations into named constants. Use shared request-cancellation utilities instead of local `AbortController` logic.

## Translations and Branding

- Use i18n for user-facing strings; no bare strings in templates. For product/source-string changes, update only backend `en.yml` and frontend `en.json`; Crowdin and the community handle other locales.
- Crowdin-generated sync PRs may update non-English files; do not flag that alone. Verify that product/brand names, OAuth scopes, API values, and other machine-readable identifiers remain unchanged unless an official localized form exists. Keep newly introduced protected terms in the Crowdin glossary as non-translatable.
- For UI strings that should adapt to branded/self-hosted installations, use `replaceInstallationName` from `shared/composables/useBranding` instead of hardcoded Chatwoot copy.

## Enterprise Compatibility

- Before changing core logic or public APIs, search both `app/` and `enterprise/` for related implementations. Keep request/response contracts compatible and mirror shared-code renames/moves where needed.
- Extend existing OSS functionality for Enterprise through modules (`prepend_mod_with` / `include_mod_with`), hooks, flags, or configuration instead of hardcoding plan/instance-specific behavior in OSS. Put Enterprise-exclusive functionality under `enterprise/`.
- For new endpoints, services, and models, consider the extension points Enterprise needs to avoid hard forks. Put Enterprise specs under `spec/enterprise`, mirroring OSS layout where applicable.
- Follow the [Enterprise development handbook](https://chatwoot.help/hc/handbook/articles/developing-enterprise-edition-features-38).

## AI Models

- Before adding/changing an OpenAI model, check the [deprecations page](https://developers.openai.com/api/docs/deprecations). Do not choose a model with a shutdown date; use its recommended replacement. Select models through `config/llm.yml` and `Llm::FeatureRouter`, not hardcoded names.

## Worktrees

- Use a separate worktree and branch per task; reuse the task's existing worktree when available.
- Keep Codex-specific local setup under `.codex/` and use `Procfile.worktree` for process orchestration.
- The setup in `.codex/environments/environment.toml` should generate per-worktree database names, ports, and Redis DB indexes. Use a distinct Overmind socket/title for each worktree.

## Commits and Pull Requests

- Prefer Conventional Commits: `type(scope): subject` (scope optional). Do not reference Claude in commit messages.
- Every PR must link an associated Linear ticket. Confirm an existing ticket or create the appropriate ticket before opening the PR; do not invent issue references.
- For medium/large features (for example, a new workflow or a change spanning several layers), link the design/PRD/implementation artifact in both the Linear ticket and the PR. Keep those links and the description aligned with the final scope.
- Start the PR description with a short, user-facing explanation of the change. Add a `Closes` section with the Linear ticket and any relevant GitHub issues.
- Follow applicable repository-template sections. For features, include product/UX `How to test` steps; for bug fixes, include `How to reproduce` when useful. Add `What changed` only when it helps review.
- Do not add a `How this was tested` section listing specs/commands; report automated validation in the task handoff instead.

<!-- BEGIN OWNER_RUNNER_FABRIC_MANAGED_V1 -->
## قرارداد جاری مالک — HOST-FIRST / VPS-FIRST / بدون Sandbox پیش‌فرض — ۲۰۲۶-۱۱-۱۶

**این بند اولویت اجرایی جدید مالک برای تمام مخزن‌های حساب rezamahrm100-ops است.**
تمام دستورهای تاریخی «ابتدا Sandbox/VM بساز»، «کد فقط در Sandbox اجرا شود»
یا «پروژه تا خالی‌شدن Sandbox منتظر بماند»، برای مسیر پیش‌فرض توسعه،
ساخت و تحویل **SUPERSEDED** هستند؛ کنترل‌های مستقل اصالت کد، محدودیت SHA،
حدود مجوزها، محرمانگی، و ایمنی میزبان همچنان معتبرند.

**DEFAULT_EXECUTION_MODE=OWNER_MAIN_ACCOUNT_DIRECT_RUNNER**
**DEFAULT_SANDBOX=OFF**
**AUTOMATIC_SANDBOX_PROVISIONING=FORBIDDEN**
**SANDBOX_BUSY_IS_NOT_A_BUILD_OR_RELEASE_BLOCKER**
**DEFAULT_TEST_HOST_PRIORITY=DEPLOYED_VPS_THEN_OWNER_WINDOWS**

این اولویت مربوط به **محل آزمون** است، نه مجوز دسترسی: پروژهٔ مستقر
روی VPS/سرور، آزمون مجاز و غیرویرانگر را با مسیر اجرایی موجود **همان میزبان**
انجام دهد؛ پروژهٔ فاقد سرور، در صورت سازگاری و احراز دسترسی، از رانر
ویندوزِ موجود مالک استفاده کند. اتصال GitHub به‌تنهایی Shell یا WICC نمی‌دهد.

- برای همهٔ مخزن‌های موجود و جدید از اتصال مجاز GitHub و **مسیر اجرایی
  موجود و احرازشدهٔ همان پروژه** استفاده کن: VPS مستقر مقدم، و در نبود
  سرور رانر ویندوز اختصاصی/مجاز مالک. Work/Codex، رانر جدید، VM،
  GitHub-hosted یا Windows Sandbox را پیش‌نیاز عادی آزمون نکن.
- کارهای معمول و مجازِ بازبینی سورس، آزمون خواندنی/واحد/قرارداد، ساخت،
  بسته‌بندی و کنترل SHA256 را با Workflow/Job و رانر واقعاً موجود انجام بده؛
  GitHub Releases خصوصی فقط با شرط‌های تصویب‌شدهٔ همان مخزن و SHA دقیق.
  Docker Compose موجودِ محصول روی VPS مجاز است؛ Stack یا محیط آزمون جدید
  را صرفاً برای دورزدن محدودیت خودکار نساز.
- سورس/اسکریپت/وابستگی اجرایی باید پیش از اجرای روی ویندوز اصلی بازبینی
  شده باشد؛ SHA دقیق، هویت مخزن و دستورات اجرایی تعیین شوند. هرگز
  کد PR ناشناس، وابستگی نامطمئن یا فایل اجرایی تأییدنشده را صرفاً به‌خاطر
  این سیاست بدون بازبینی روی حساب اصلی اجرا نکن. اگر بازبینی کافی نیست:
  **BLOCKED_REVIEW_REQUIRED** فقط در صورت نقص مشخص شواهد ایمنی؛ نه صرف نبود بازبین دوم و نه «برو Sandbox ایجاد کن».
- استفاده از حساب اصلی GitHub به معنی اشتراک workspace، cache، رمز،
  فایل‌های موقت یا مجوزهای اجرایی همهٔ مخزن‌ها نیست. هر پروژه همان
  برچسب رانر، کارپوشه، مسیر خروجی و مرز دسترسی اختصاصی خود را حفظ کند.
- هیچ مرحله‌ای برای دریافت خروجی تأییدشده، اجرای دستور مجاز ساخت
  یا تحویل APK/EXE/ZIP منتظر آزادشدن Windows Sandbox نماند.
- اگر گردش‌کار تاریخی در `main` Sandbox را اجباری می‌داند، تنها پس از
  بررسی کد، اثر روی میزبان، سلامت مسیر جایگزین و شرط‌های مجوز، اصلاح
  حداقلی همان Workflow را پیشنهاد/اجرا کن؛ هرگز کد نامطمئن را صرفاً با
  تغییر `runs-on` روی میزبان حساس اجرا نکن. گیت امنیتی را دور نزن.
- مسیر Sandbox فقط وقتی فعال شود که مالک برای **همان کار مشخص**
  جداگانه درخواست کند. کتابخانهٔ سابق Owner-SandboxLease.ps1 صرفاً
  برای سازگاری تاریخی حفظ شده و مجوز شروع خودکار Sandbox نیست.
- نصب/اجرای برنامه روی سیستم شخصی، دسترسی مدیر سیستم، تغییر امنیت
  میزبان، اسرار تولیدی، اتصال حساب واقعی، و استقرار واقعی خودکار
  صرفاً با مجوز مستقل و محدود انجام می‌شود.
- تغییر این قرارداد روی مخزن‌ها توسط کنترل‌گر مرکزی WICC فقط در بخش
  مدیریت‌شدهٔ AGENTS.md همگام می‌شود؛ سایر دستورالعمل‌های محصول محفوظ.
- آزمون مخرب/پرفشار، مهاجرت داده، اتصال حساب واقعی، نصب یا تغییر سرویس
  فعال را بدون مجوز ویژه و طرح بازگشت اجرا نکن؛ وضعیت
  `NOT_RUN/BLOCKED_TEST_SAFETY` را به‌جای PASS ثبت کن.
- در محصولات چندموتوره، از قرارداد مشترک و Adapter نسخه‌دار، Registry
  قابلیت مجاز و بستهٔ هماهنگ Engine-First / Batch-First استفاده کن؛
  UI رسمی موتور را با ادغام بومی اشتباه نگیر و مسیرهای موازی نساز.
- تنها شواهد واقعی SHA، Run/Job/Log، بسته، نصب و عملکرد را گزارش کن؛
  CI سبز، Build، Release، نصب و آمادگی محصول حالات متفاوت‌اند.
  `NOT_RUN`، `UNKNOWN` و `BLOCKED` را دقیق بنویس.

## اصلاحیهٔ مصوب مالک — ۲۰۲۶-۱۱-۲۵: عدم الزام بازبین دوم برای کار عادی

- `REQUIRED_HUMAN_REVIEWERS_NORMAL=0`؛ `INDEPENDENT_REVIEWER_REQUIRED_NORMAL=false`. در عملیات عادی و غیرحساسِ مجاز، نبود شخص دوم، بازبین انسانی یا حساب جداگانه به‌تنهایی مانع توسعه، آزمون، Build، Package یا Release خصوصی مجاز نیست. همان عامل توسعه می‌تواند بازبینی فنی مستندِ سورس، Diff، وابستگی و اثر میزبان را انجام دهد؛ بررسی خودکار مکمل شواهد است، نه تأیید ساختگی GitHub یا ادعای بازبینی مستقل.
- پیش از اجرای روی رانر دائمی WICC/VPS، هویت و SHA دقیق، کد و وابستگی اجرایی، Trigger مجاز، محدودهٔ اثر و کنترل منابع واقعاً بررسی شوند. `BLOCKED_REVIEW_REQUIRED` فقط برای نقص مشخصِ شواهد ایمنی یا بازبینی لازم به کار رود، نه صرف نبود فرد دوم؛ عامل ابتدا خودش بررسی مجاز را تکمیل کند.
- قواعد واقعی GitHub، مجوزهای مالک/Exact-SHA و گیت‌های عملیات حساس، اسرار، تولید، دسترسی ممتاز و کد نامطمئن محفوظ‌اند. این سیاست مجوز خودتأییدی PR به‌جای بازبینی الزامی GitHub، جعل هویت مالک، تغییر گیت حساس یا اجرای کد نامطمئن نیست. ایجاد الزام جدیدِ شخص دوم برای کار عادی بدون تصمیم صریح مالک ممنوع است.

## قرارداد تکمیلی ۶.۲.۱ ناظر — First Working Trace و Resumable Execution

این بخش **سیاست جدید موازی برای هر محصول نیست**؛ قاعدهٔ عمومی دربارهٔ ترتیب اجرای
مأموریت و ثبت وضعیت است و هدف، مرجع اجرایی یگانه و خط‌قرمزهای اختصاصی
هر مخزن را تغییر نمی‌دهد. AUDIT صرفاً بررسی بدون تغییر است؛ EXECUTE اقدام مجاز.

- هر EXECUTE با `MISSION_ID`، `MISSION_DOD` و تعریف **یک زنجیرهٔ ارزشمند
  از ورودی تا خروجی قابل‌مشاهده** آغاز شود. نخست فقط P0/P1 و ریسک ایمنی
  همان مسیر؛ سپس موتور/Adapter/API/State/UI واقعی با دادهٔ کاملاً مصنوعی،
  جداسازی آزمایشیِ احرازشده و Trace/Run/SHA؛ بعد گسترش دسته‌ای و بستهٔ تحویل.
  CONTRACT/Mock/Unit/CI به معنی REAL_ENGINE_RUNTIME یا SYNTHETIC_E2E نیست.
- تا وقتی کار فنیِ ایمن، مرتبط، مجاز و در دسترس باقی است، عامل با گزارش
  پیشرفت یا چند Commit توقف نکند: اصلاح→آزمون مرتبط→رفع شکست→بازتأیید.
  `DONE` فقط برای DoD اثبات‌شدهٔ **همان مأموریت**؛ `BLOCKED` فقط با مانع
  واقعی پس از انجام دیگر کارهای مجاز؛ `INTERRUPTED` با وقفهٔ واقعی
  ابزار/جلسه و نقطهٔ ادامه. `IN_PROGRESS` میانی است؛ این‌ها با
  `ENGINEERING_READY/READY_FOR_OWNER_TEST/OWNER_ACCEPTED` یکی نیستند.
- Checkpoint پس از بستهٔ واقعی و پیش از وقفهٔ قابل‌پیش‌بینی **فقط در همان
  PR/Issue/handoff موجود و معتبر**: `MISSION_ID/MISSION_DOD/SOURCE_SHA/
  CHECKPOINT_SHA/PR-Run-Job-Trace/PASS-FAIL-NOT_RUN/NEXT_EXACT_ACTION/RESUME_PROMPT`.
  SHA سند handoff را با SHA آزموده‌شده اشتباه نگیر. اگر ثبت ممکن نیست
  `CHECKPOINT_NOT_PERSISTED` را صریح اعلام کن.
- در جلسهٔ بعد فقط با آغاز تازهٔ مالک یا Trigger مجاز، GitHub live را
  با Checkpoint تطبیق بده و از نخستین اقدام ناتمام ادامه بده؛ پرامپت
  خودکار بیدار نمی‌شود. برای پیگیری مأموریت Runner/Workflow/Issue/PR
  تکراری نساز. اگر اجرای مصنوعی در VPS/Windows ایمن یا مجاز نیست،
  آن مرز `NOT_RUN/BLOCKED` است؛ هیچ گیت host/owner/exact-SHA/production،
  دادهٔ واقعی و ارسال خارجی به این دلیل دور زده نمی‌شود.

## قاعدهٔ «بریم»، معیار پایان و جلوگیری از توسعهٔ بی‌انتها — همهٔ مخازن مجاز

**مسیریاب غیرمرجع‌حاکمِ مخازن:** 
`https://github.com/rezamahrm100-ops/windows-command-center/blob/main/config/nazer-owner-repository-router-v621.json`
فقط برای یافتن مسیر خواندن و پیشنهادِ معیار پایان مختص هر محصول است؛ فهرست ثابت را با GitHub زنده تطبیق بده و مخزن تازه را از `AGENTS.md` خودش بخوان؛
دامنهٔ مصوب مالک، فایل‌های سیاست اختصاصی و آخرین GitHub/Run از آن مقدم‌اند.
اگر فایل مرکزی هنوز در `main` نیست، به‌جای حدس‌زدن مقصد `ROUTER_NOT_PUBLISHED` ثبت کن.

- «بریم» در چتِ توسعهٔ یک **مخزن معلوم**: `AGENTS.md` جاری →
  مرجع اجراییِ اختصاصی معرفی‌شده در همان فایل و فهرست بالا →
  handoff/PR/Issue **موجود و معتبر** → main/branch SHA و CI/Run/Release
  زنده → نخستین اقدام ناتمام مجاز. برای مخزن نامعلوم یا پروژهٔ چت
  نامشخص، *مخزن را حدس نزن*؛ فقط نام/لینک مخزن را بپرس.
- `MISSION_DOD` باید رفتار قابل‌مشاهدهٔ محصول، مسیر موتور و مجوز،
  دادهٔ مصنوعی، خروجی نصب/بسته در صورت نیاز، شواهد نسخه/SHA و
  حدِ پذیرش مالک را مشخص کند. **وضعیت «DONE» فقط برای همان مأموریت**
  معتبر است و هرگز دستور «همیشه توسعه را ادامه بده» نیست.
- وقتی معیار مهندسیِ هدفِ مصوب تحقق یافت، اصلاحات بی‌هدف، گسترش
  خودسرانهٔ Scope، تکرار QA/معماری و ساخت Workflow/Runner بیشتر
  **ممنوع**؛ `MISSION_STATE=DONE` و همراه مدارک و وضعیت مستقل
  `READY_FOR_OWNER_TEST/OWNER_ACCEPTED` اعلام کن.
- برای مخزن بذر/کپی بالادستی/فاقد Issue و هدف فعلی، `NO_ACTIVE_MISSION`
  گزارش کن؛ «بریم» مجوز ساخت ویژگی جدید یا تبدیل مخزن به محصول نیست.
  ابتدا Scope/DoD مصوب درخواست شود.
- اگر در فهرست مرکزی لینکی وجود ندارد، فایل معرفی‌شده حذف شده یا PR
  هنوز ادغام نشده است، از همان مسیرِ موجود در مخزن استفاده کن؛
  `UNKNOWN/NOT_VERIFIED` بگذار و با مسیر فرضی یا گزارش قدیمی جایگزین نکن.
- Checkpoint فقط پس از بستهٔ مؤثر، و در **همان مرجع واحد** ثبت شود؛
  هر اصلاح سند یا PR جدید به‌خودی‌خود `ENGINEERING_READY` نیست.

مرجع مرکزی:
https://github.com/rezamahrm100-ops/windows-command-center/blob/main/docs/OWNER_HOST_FIRST_EXECUTION_STANDARD_FA.md
https://github.com/rezamahrm100-ops/windows-command-center/blob/main/docs/RUNNER_FLEET_RELEASE_STANDARD_FA.md

برای مخزن‌های تازه، کنترل‌گر WICC با فهرست زندهٔ GitHub این بند را همگام
کند. اگر GitHub دسترسی نوشتن نداد یا Branch Protection مانع شد،
آن را گزارش کند و هیچ محدودیتی را پنهانی دور نزند.

## قرارداد نگهداری خروجی‌های محلی پس از انتشار — ۲۰۲۶-۱۱-۲۴

- سیاست مالک برای تمام رانرهای موجود و آینده: خروجی‌های ساخت محلی فقط تا زمانی نگهداری شوند که انتشار خصوصی GitHub Releases به‌طور مستقل تأیید نشده است. پس از انتشار، نسخهٔ اضافی محلی فقط با اثبات تطابق SHA256 و حجم از روی دانلود واقعی همان asset حذف شود. وجود تگ، URL، manifest یا موفقیت upload به‌تنهایی مجوز حذف نیست.
- این قاعده فقط برای فایل‌های تولیدشده و شناخته‌شده در محدودهٔ خروجی همان run یا آرشیوهای دارای manifest معتبر است. پروژه، سورس، دادهٔ شخصی، مدل‌های Ollama و موسیقی، Docker/WSL، پشتیبان‌ها، runner registration، secrets و فایل‌های نصب‌شده خارج از محدوده‌اند. فایل لازم برای rollback یا نصب فعال حفظ شود.
- اگر انتشار ناموفق/ناقص، asset غایب، هش متفاوت، فایل قفل یا مسیر نامطمئن باشد، فایل محلی حفظ شود. هیچ تغییر ACL، توقف سرویس یا حذف بازگشتی نامحدود برای پاک‌سازی مجاز نیست.
- پاک‌سازی پس از انتشار به‌صورت مرحلهٔ اجرایی در workflow انتشار موجود هر مخزن انجام شود؛ متن این سیاست به‌تنهایی فعال‌سازی محسوب نمی‌شود. به‌کارگیری workflow مشترک فقط در صورت دسترسی مجاز و pin به SHA بازبینی‌شده. مسیرهای انتشار اختصاصی باید جداگانه با شواهد واقعی تطبیق داده شوند.
- برای فایل‌های چندپاره، دانلود و تطابق هش همهٔ قطعات و بازسازی هش فایل اصلی الزامی است. گزارش تعداد فایل، حجم و حالت PASS/RETAINED/PARTIAL جدا از موفقیت Release ثبت شود.

<!-- END OWNER_RUNNER_FABRIC_MANAGED_V1 -->
