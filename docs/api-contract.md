# API Contract

## Purpose

The API Contract defines:

# how TankUp systems communicate.

This document creates consistency between:

- frontend,
- backend,
- mobile,
- admin systems,
- future integrations.

The API is NOT merely technical infrastructure.

It is:

# operational communication infrastructure.

---

# Core Philosophy

The API should reflect:

- operational truth,
- workflow discipline,
- status integrity,
- auditability.

Endpoints should represent:

# business operations,
not database tables.

---

# Architectural Principles

---

# Principle 1 — Operational Clarity

Endpoints should describe:

# operational intent.

---

# Good Example

```txt
POST /delivery-requests/{id}/accept-offer