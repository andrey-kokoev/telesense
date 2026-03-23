# Authority Topologies

This document names the main authority and delegation shapes that `telesense` supports.

The goal is to make deployment and sharing decisions concrete:

- who keeps the strongest token
- who gets delegated budget control
- who only gets service-use access

## Core Entities

- `Host`
  - deployment-wide authority
  - holds the host-admin token
- `Budget`
  - one allowance domain
  - can have one canonical budget-admin token
  - can issue many service entitlement tokens
- `User`
  - a person who only needs service access
  - uses a service entitlement token

## Smallest Complete Topology

### `[Host,Budget] - User`

This is the smallest complete authority shape.

```text
[Host,Budget] -> User
```

Meaning:

- one person operates as both host owner and budget owner
- one budget exists
- one or more end users consume service from that budget

Typical use:

- one family
- one small team
- one person deploying and administering everything

Token split:

- host owner keeps the `Host Admin Token`
- host owner may also keep the `Budget Admin Token`
- end user receives a `Service Entitlement Token`

## Delegated Budget Topology

### `Host - [Budget] - User`

```text
Host -> [Budget] -> User
```

Meaning:

- host owner keeps deployment-wide control
- budget control is delegated
- end user only gets service access

Typical use:

- parent deploys
- older child manages one budget
- grandparent only uses the service

Token split:

- host owner keeps the `Host Admin Token`
- delegated manager gets the `Budget Admin Token`
- end user gets the `Service Entitlement Token`

## Multi-User Single-Budget Topology

### `Host - Budget - Many Users`

```text
Host -> Budget -> User A
               -> User B
               -> User C
```

Meaning:

- one budget backs many service users
- each user can receive their own service entitlement token
- all usage still drains the same budget

Typical use:

- one household
- one project team
- one shared allowance pool

Important property:

- many entitlement tokens can point to one budget
- minting a service entitlement token does not itself add allowance

## Multi-Budget Host Topology

### `Host - Many Budgets - Many Users`

This is the most complex standard shape.

```text
Host -> Budget A -> Users...
     -> Budget B -> Users...
     -> Budget C -> Users...
```

Meaning:

- one deployment owner manages many independent budgets
- each budget has its own admin boundary
- each budget can issue many service entitlement tokens

Typical use:

- one deployment serving multiple families
- one host serving multiple teams
- one operator separating allowance by group

Token split:

- host owner keeps the `Host Admin Token`
- each budget can have one canonical `Budget Admin Token`
- each budget can issue many `Service Entitlement Tokens`

## Token Hierarchy

The three token levels are intentionally not interchangeable.

### 1. Host Admin Token

Highest authority.

Grants:

- deployment-wide administration
- access to host admin UI
- implicit service access on the default budget

Use when:

- creating budgets
- delegating budget admins
- overseeing the whole deployment

### 2. Budget Admin Token

Budget-scoped authority.

Grants:

- administration for one budget only
- access to that budget's budget-admin UI
- implicit service access on that same budget

Use when:

- minting service entitlement tokens
- labeling and disabling individual entitlement tokens
- managing one budget without host-wide authority

### 3. Service Entitlement Token

Service-use authority only.

Grants:

- room creation and service use against one budget

Does not grant:

- host admin
- budget admin

Use when:

- giving someone service access without administrative control

## Single Entry Point

There is one token entry field on the landing screen.

The app resolves the token type server-side and then:

- host-admin token
  - opens host admin
- budget-admin token
  - opens budget admin for its budget
- service entitlement token
  - enables service use only

This is one input surface, not one interchangeable token.

## Recommended Sharing Pattern

For most deployments:

- host owner keeps the `Host Admin Token`
- one delegated operator per budget gets the `Budget Admin Token`
- normal users get `Service Entitlement Tokens`

That keeps the authority graph simple while still supporting delegation.
