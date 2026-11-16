# Plan for a mixed d9 and Directus 11 deployment

Branch codex/d9-rest-plan, based on 14dfd02. The selection unit is a named server registered with DB_BrokerService. Keep DBtype.directus as the v11 default and add DBtype.d9 as an explicit opt-in. The first acceptance target is the existing supply d9 server at https://tps-supply.nfeya.org. Supply is an empty project intended for future use by both tps-srv and tps-adm. This release delivers @toopro/db. The owner will wire both applications later.

## Implementation order

1. Establish a passing offline baseline and an opt-in contract suite. Existing db.spec.ts assumes stats credentials in some assertions, leaves the token assignment commented out, and can silently bypass remote tests on failed login. An explicitly enabled suite must fail if its fixture cannot authenticate. Seed disposable d9 and v11 instances with the same collections, relation, and restricted user. Record the exact server and SDK versions tested.
2. Test the installed @directus/sdk against d9 before choosing a transport. Compare emitted requests and returned values for item CRUD, filters, fields, deep queries, sorting, pagination, bulk writes, permissions errors, static token and password login, refresh, readMe and logout. Exercise role/user system endpoints separately. For files, test metadata, multipart upload and asset download on the runtimes that use them. Require Google SSO callback, cookie/session restoration, refresh and logout in browser contract coverage for both backends. Use the shared REST code where these tests pass and isolate verified differences behind the existing service API.
3. Add the enum value in types/types.ts. Compile builders in types/query.type.ts and service-directus.ts using the resolved server type. Preserve existing precompiled Directus query objects and the default for callers using for() with no argument. Cover nested fieldQ and repeated compilation of a builder. Prove isolation with alternating reads and writes on two named servers in one broker, including overlapping collection names and nested service lookups.
4. Select authentication per registration in broker.service.ts. Preserve explicit client and login overrides. Cover login before service creation, refresh/retry and logout without leaking session state across servers. Review the class-wide AUTH_MODE and retained login callbacks when updating a registration.
5. Exercise the published package entry point in Node and a browser. Use the existing Angular injected-client pattern and Nest explicit login callback as compatibility cases. Document examples for the owner to wire either app.
6. Verify the same query and result against two named servers in one broker process. Record the backend versions, runtime, authentication method and fixture used for each result.

## Authentication acceptance

- Static token. Verify identity before publishing logged-in status. Test rejection and replacement of an invalid token, local logout, and isolation from the other named server.
- Email/password. Test successful and rejected credentials, refresh after access-token expiry, simultaneous requests during refresh, logout and subsequent login. Exercise JSON in Node and the supported cookie-based mode in a browser.
- Google SSO. The existing Angular flow supplies an SDK client after redirect. Preserve this handoff. Require a successful authenticated read after callback and browser reload, session refresh, logout, and recovery from an expired or cancelled flow. Run deterministic callback cases plus an end-to-end check against a configured provider before claiming live Google verification.
- Resolve browser mode per named server. The current library defaults browsers to session. d9 documents json and cookie for login and refresh. Verify d9 cookie behavior independently of the existing v11 session client. [d9 authentication reference](https://d9.webcapsule.io/reference/authentication.html)
- Provide two broker helpers for named servers and keep the existing injected-client path. The URL helper takes the server name, provider and application callback URL. Build from the registered server base URL, preserve any installation path, and encode the redirect exactly once. The caller navigates to the result.
- The callback helper takes the server name, restores its browser session using the registered or library-created client, verifies the current user, then publishes the login outcome through existing broker subscriptions. Return the existing IsLoginStatus type. Cover repeat callbacks, denied or expired sessions and isolation from another signed-in server. Angular owns its callback route and UI.
- Acceptance examples should exercise both the new two-call flow and the existing upsertServer handoff with an externally created SDK client.

## Review findings

- Batch deletion checks a builder method before compiling its numeric limit. The branch validates the compiled limit. Verify invalid limits cannot send a request and that each server enforces the limit on actual rows.
- The branch removes full server/credential object logging from missing-login/password-login failures and configuration logging from the test harness.
- Broker service lookup uses the bare collection name even when registered with a server prefix. Resolve collisions for cross-server relation hydration while preserving unambiguous legacy lookups.
- Nested fieldQ currently produces _fieldQ. Cover a two-level relation in the shared compiler tests. Inspect cache invalidation after query-based deletes separately.

## MySQL

Scope a separate server-side adapter once a concrete consumer and schema are known. Define parameterized query and identifier handling, relation metadata, field selection, sort, filters, pagination, mutation and transaction semantics, and error mapping. Decide which permissions, hooks, files and authentication semantics callers require. Angular must reach it through a server API. Keep the mysql placeholder unsupported in the d9 branch.

## Supply acceptance evidence

The installed @directus/sdk 20.1.0 passed a live Node REST probe using a static admin token. It read the current user, created a transient collection and two items, filtered and sorted projected fields, bulk-updated both rows, deleted one matching row with a limit of one, and deleted the remaining row by ID. Collection cleanup was verified by listing the schema. This was a transport probe. Mixed-broker routing, restricted permissions, relations, files, and browser sessions still need coverage. No supply registration was found in the two apps' apps/ or libs/ source trees.
