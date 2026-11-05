export const typeDefs = /* GraphQL */ `
  enum Role {
    ADMIN
    EDITOR
  }

  enum Status {
    DRAFT
    PUBLISHED
  }

  type User {
    id: ID!
    email: String!
    role: Role!
  }

  type Media {
  id: ID!
  url: String!
  alt: String
  mimeType: String
  size: Int
  createdAt: DateTime!
}

  scalar DateTime

  type BlogPost {
    id: ID!
    title: String!
    slug: String!
    content: String!
    defaultLocale: String!
    locale: String!
    isFallback: Boolean!
    status: Status!
    publishedAt: DateTime
    publishAt: DateTime
    author: User!
    heroMedia: Media
    createdAt: DateTime!
    updatedAt: DateTime!
    versions: [PostVersion!]!
    translations: [PostTranslation!]!
  }

  type PostTranslation {
    id: ID!
    locale: String!
    title: String!
    slug: String!
    content: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type AuthPayload {
  accessToken: String!
  refreshToken: String!
  user: User!
}

type Query {
  # ...
  me: User
}

  input CreateBlogPostInput {
    title: String!
    slug: String
    content: String!
    heroMediaId: ID
  }

  input UpdateBlogPostInput {
    title: String
    slug: String
    content: String
    heroMediaId: ID
  }

  type Query {
    # publishedOnly defaults to true for safety
    posts(publishedOnly: Boolean = true, locale: String): [BlogPost!]!
    post(id: ID, slug: String, locale: String): BlogPost
    searchPosts(
      query: String!
      publishedOnly: Boolean = true
      locale: String
    ): [BlogPost!]!
    postVersions(postId: ID!): [PostVersion!]!
    webhookDeliveries(webhookId: ID): [WebhookDelivery!]!
    media(limit: Int = 50, offset: Int = 0): [Media!]!
    me: User
  }

  type DiffPart {
    value: String!
    added: Boolean!
    removed: Boolean!
  }

  type PostVersion {
    id: ID!
    title: String!
    slug: String
    content: String!
    status: Status!
    createdAt: DateTime!
    createdBy: String!
    diffFromPrevious: [DiffPart!]!
  }

  type CloudinarySignature {
    timestamp: Int!
    signature: String!
    apiKey: String!
    cloudName: String!
    folder: String!
  }

  type Webhook {
    id: ID!
    url: String!
    event: String!
    active: Boolean!
    createdAt: DateTime!
  }

  type WebhookDelivery {
    id: ID!
    webhookId: ID!
    event: String!
    status: String!
    attempts: Int!
    maxAttempts: Int!
    lastError: String
    nextAttemptAt: DateTime!
    deliveredAt: DateTime
    createdAt: DateTime!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    refreshSession(refreshToken: String!): AuthPayload!
    logout(refreshToken: String!): Boolean!
    createPost(input: CreateBlogPostInput!): BlogPost!
    updatePost(id: ID!, input: UpdateBlogPostInput!): BlogPost!
    publishPost(id: ID!): BlogPost!
    unpublishPost(id: ID!): BlogPost!
    deletePost(id: ID!): Boolean!
    createMedia(url: String!, alt: String, mimeType: String, size: Int): Media!
    createWebhook(url: String!, event: String!): Webhook!
    createUploadSignature: CloudinarySignature!
    schedulePost(id: ID!, publishAt: DateTime!): BlogPost!
    unschedulePost(id: ID!): BlogPost!
    restoreVersion(postId: ID!, versionId: ID!): BlogPost!
    upsertTranslation(
      postId: ID!
      locale: String!
      title: String!
      slug: String!
      content: String!
    ): PostTranslation!
    deleteTranslation(postId: ID!, locale: String!): Boolean!
    deleteMedia(id: ID!): Boolean!
    updateMedia(id: ID!, alt: String): Media!
  }
`;
