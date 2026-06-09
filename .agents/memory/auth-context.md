---
name: Auth context pattern
description: How to use useAuth() hook in the palata artifact
---

## Pattern

```ts
const { state } = useAuth();
const currentUser = state.kind === "authenticated" ? state.user : null;
```

`useAuth()` returns `AuthContextValue = { state: AuthState, signIn, signOut }`

`AuthState` is a discriminated union:
- `{ kind: "loading" }`
- `{ kind: "unauthenticated" }`  
- `{ kind: "authenticated"; session: Session; user: PalataUser }`

`PalataUser`: id, role (customer/expert/admin), full_name, email, is_active

**Why:** Easy mistake — destructuring `{ user }` from useAuth() will fail because user is not a top-level property.
