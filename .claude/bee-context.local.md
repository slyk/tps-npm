# Plan for a mixed d9 and Directus 11 deployment

Branch codex/d9-rest-plan, based on 14dfd02. The selection unit is a named server registered with DB_BrokerService. Keep DBtype.directus as the v11 default and add DBtype.d9 as an explicit opt-in. The first acceptance target is the existing supply d9 server at https://tps-supply.nfeya.org. Its application clients and production authentication requirements are open.

## Implementation order

1. Establish a passing offline baseline and an opt-in contract suite. Existing db.spec.ts assumes stats credentials in some assertions, leaves the token assignment commented out, and can silently bypass remote tests on failed login. An explicitly enabled suite must fail if its fixture cannot authenticate. Seed disposable d9 and v11 instances with the same collections, relation, and restricted user. Record the exact server and SDK versions tested.
2. Test the installed @directus/sdk against d9 before choosing a transport. Compare emitted requests and returned values for item CRUD, filters, fields, deep queries, sorting, pagination, bulk writes, permissions errors, static token and password login, refresh, readMe and logout. Exercise role/user system endpoints separately. For files, test metadata, multipart upload and asset download on the runtimes that use them. Probe browser OAuth and cookie/session refresh if the pilot uses them. Use the shared REST code where these tests pass and isolate verified differences behind the existing service API.
3. Add the enum value in types/types.ts. Compile builders in types/query.type.ts and service-directus.ts using the resolved server type. Preserve existing precompiled Directus query objects and the default for callers using for() with no argument. Cover nested fieldQ and repeated compilation of a builder. Prove isolation with alternating reads and writes on two named servers in one broker, including overlapping collection names and nested service lookups.
4. Select authentication per registration in broker.service.ts. Preserve explicit client and login overrides. Cover login before service creation, refresh/retry and logout without leaking session state across servers. Review the class-wide AUTH_MODE and retained login callbacks when updating a registration.
5. Exercise both application wrappers against the built package. Angular's broker initializer and Nest's DirectusModule explicitly supply a login function, Angular's core OAuth flow supplies a client, and some Angular product services precompile queries for directus. Audit standalone server registrations too. Switch only the pilot registration once its workflows pass. Roll back by restoring that registration and matching endpoint. A data migration, if needed, requires its own cutover and rollback.
6. Run both app typechecks/builds and both REST contract suites before packaging. Record the supported d9 version, verified auth modes, and per-server configuration example.

## Review findings

- Batch deletion checks a builder method before compiling its numeric limit. The branch validates the compiled limit. Verify invalid limits cannot send a request and that each server enforces the limit on actual rows.
- The branch removes full server/credential object logging from missing-login/password-login failures and configuration logging from the test harness.
- Broker service lookup uses the bare collection name even when registered with a server prefix. Resolve collisions for cross-server relation hydration while preserving unambiguous legacy lookups.
- Nested fieldQ currently produces _fieldQ. Cover a two-level relation in the shared compiler tests. Inspect cache invalidation after query-based deletes separately.

## MySQL

Scope a separate server-side adapter once a concrete consumer and schema are known. Define parameterized query and identifier handling, relation metadata, field selection, sort, filters, pagination, mutation and transaction semantics, and error mapping. Decide which permissions, hooks, files and authentication semantics callers require. Angular must reach it through a server API. Keep the mysql placeholder unsupported in the d9 branch.

## Supply acceptance evidence

The installed @directus/sdk 20.1.0 passed a live Node REST probe using a static admin token. It read the current user, created a transient collection and two items, filtered and sorted projected fields, bulk-updated both rows, deleted one matching row with a limit of one, and deleted the remaining row by ID. Collection cleanup was verified by listing the schema. This was a transport probe. Mixed-broker routing, restricted permissions, relations, files, and browser sessions still need coverage. No supply registration was found in the two apps' apps/ or libs/ source trees.
