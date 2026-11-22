CMS SITE

========

Next.js application for the public-facing content experience of the Headless CMS.

RESPONSIBILITIES

----------------

Provides the frontend for delivering content managed through the CMS API.

TECHNOLOGY STACK

----------------

Next.js

React

TypeScript

PREREQUISITES

-------------

Node.js 22 or compatible version.

npm.

The CMS API running and reachable.

ENVIRONMENT

-----------

NEXT_PUBLIC_API_URL: CMS API endpoint used by the Site application.

Do not put private credentials or server-only secrets in NEXT_PUBLIC_ variables. Next.js exposes these values to browser-side code.

SETUP

-----

Run from the repository root:

npm --prefix site ci

npm --prefix site run dev

The development server defaults to port 3000.

BUILD

-----

npm --prefix site run build

PRODUCTION SERVER

-----------------

npm --prefix site run start

The production server requires a successful build first.

For architecture, API setup, database configuration and deployment scope, see the repository README at ../README.md.
