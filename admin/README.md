CMS ADMIN

=========

React and TypeScript administration interface for the Headless CMS.

RESPONSIBILITIES

----------------

Provides the management interface for interacting with CMS functionality through the GraphQL API.

TECHNOLOGY STACK

----------------

React

TypeScript

Vite

ESLint

PREREQUISITES

-------------

Node.js 22 or compatible version.

npm.

The CMS API running and reachable.

ENVIRONMENT

-----------

VITE_API_URL: CMS GraphQL API endpoint.

For local development, Vite proxies /graphql to http://localhost:4000.

SETUP

-----

Run from the repository root:

npm --prefix admin ci

npm --prefix admin run dev

The development server defaults to port 5173.

BUILD AND LINT

--------------

Build:

npm --prefix admin run build

Lint:

npm --prefix admin run lint

Lint findings should be evaluated independently of build results.

For architecture, API setup, database configuration and deployment scope, see the repository README at ../README.md.
