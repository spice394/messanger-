---
name: Orval *Params TS2308 collision fix
description: How to fix TS2308 collisions in lib/api-zod when Orval generates *Params Zod schemas that duplicate TypeScript types from generated/types/
---

## The rule

When `lib/api-spec/openapi.yaml` has operations with query parameters, Orval generates BOTH:
1. A Zod schema named `<OperationIdPascal>Params` in `lib/api-zod/src/generated/api.ts`
2. A TypeScript interface named `<OperationIdPascal>Params` in `lib/api-zod/src/generated/types/<operationIdCamel>Params.ts`

When `lib/api-zod/src/index.ts` uses `export * from "./generated/api"` AND `export * from "./generated/types"`, TypeScript raises TS2308 ("module has already exported a member named X").

## Why

Orval's Zod plugin and TypeScript plugin both emit the same names for query param schemas. The `lib/api-zod` barrel re-exports both, causing the collision. This does NOT affect codegen itself — only the chained `typecheck:libs` step fails.

## How to apply

After running codegen, if `pnpm run typecheck:libs` raises TS2308 for `*Params` names:

1. Identify the colliding names from the error output.
2. Change `lib/api-zod/src/index.ts` from:
   ```ts
   export * from "./generated/api";
   export * from "./generated/types";
   ```
   To:
   ```ts
   export * from "./generated/api";
   // Explicitly re-export types from generated/types, EXCLUDING the colliding *Params names
   export type {
     // list every type from generated/types EXCEPT the colliding ones
     AuthResponse, User, Message, ...
   } from "./generated/types";
   ```
3. The colliding names (Zod schema versions) will then be exported only from `./generated/api`.

## Identifying what's in generated/types

```bash
ls lib/api-zod/src/generated/types/
# Each .ts file corresponds to an exported type
# getMessagesParams.ts → exports GetMessagesParams (collidable)
# removeReactionParams.ts → exports RemoveReactionParams (collidable)
```

Not all operations generate types in the types/ folder — only those where Orval decides to emit a separate interface. Check the generated/types/ folder after each codegen run.
