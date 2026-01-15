/**
 * Comprehensive compatibility tests for @graphql-tools/merge upgrade
 *
 * This test file verifies that the mergeTypeDefs function works correctly
 * with all options used in Schema.js after upgrading from v8.x to v9.x
 *
 * Options used in production:
 * - forceSchemaDefinition: false
 * - useSchemaDefinition: false
 * - sort: true
 * - throwOnConflict: true
 */

import { mergeTypeDefs } from '@graphql-tools/merge'
import { print, parse } from 'graphql'

describe('@graphql-tools/merge compatibility tests', () => {
  describe('mergeTypeDefs basic functionality', () => {
    it('should merge multiple type definitions', () => {
      const typeDefs1 = `
        type Query {
          hello: String
        }
      `
      const typeDefs2 = `
        type User {
          id: ID!
          name: String!
        }
      `

      const merged = mergeTypeDefs([typeDefs1, typeDefs2], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('type Query')
      expect(result).toContain('type User')
      expect(result).toContain('hello: String')
      expect(result).toContain('id: ID!')
    })

    it('should handle extend type correctly', () => {
      const base = `
        type Query
        type Mutation
      `
      const extension = `
        extend type Query {
          getUser: User
        }
        type User {
          id: ID!
        }
      `

      const merged = mergeTypeDefs([base, extension], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('getUser: User')
    })

    it('should return single schema unchanged', () => {
      const schema = `
        type Query {
          hello: String
        }
      `

      const merged = mergeTypeDefs([schema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('type Query')
      expect(result).toContain('hello: String')
    })
  })

  describe('forceSchemaDefinition option', () => {
    it('should not force schema definition when set to false', () => {
      const typeDefs = `
        type Query {
          hello: String
        }
      `

      const merged = mergeTypeDefs([typeDefs], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      // Should not contain schema { query: Query } when forceSchemaDefinition is false
      expect(result).not.toMatch(/^schema\s*\{/)
    })
  })

  describe('useSchemaDefinition option', () => {
    it('should not produce schema definition block when set to false', () => {
      const typeDefs = `
        type Query {
          hello: String
        }
      `

      const merged = mergeTypeDefs([typeDefs], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).not.toContain('schema {')
    })
  })

  describe('sort option', () => {
    it('should sort types alphabetically when sort is true', () => {
      const typeDefs1 = `
        type Zebra {
          id: ID!
        }
      `
      const typeDefs2 = `
        type Apple {
          id: ID!
        }
      `
      const typeDefs3 = `
        type Query {
          hello: String
        }
      `

      const merged = mergeTypeDefs([typeDefs1, typeDefs2, typeDefs3], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      const appleIndex = result.indexOf('type Apple')
      const queryIndex = result.indexOf('type Query')
      const zebraIndex = result.indexOf('type Zebra')

      // Verify alphabetical order: Apple < Query < Zebra
      expect(appleIndex).toBeLessThan(queryIndex)
      expect(queryIndex).toBeLessThan(zebraIndex)
    })
  })

  describe('throwOnConflict option', () => {
    it('should throw error on conflicting field types when throwOnConflict is true', () => {
      const typeDefs1 = `
        type User {
          id: ID!
          name: String!
        }
      `
      const typeDefs2 = `
        type User {
          id: ID!
          name: Int!
        }
      `

      expect(() => {
        mergeTypeDefs([typeDefs1, typeDefs2], {
          forceSchemaDefinition: false,
          useSchemaDefinition: false,
          sort: true,
          throwOnConflict: true,
        })
      }).toThrow()
    })
  })

  describe('AWS AppSync directive compatibility', () => {
    const AWS_TYPES = `
      directive @aws_iam on FIELD_DEFINITION | OBJECT
      directive @aws_oidc on FIELD_DEFINITION | OBJECT
      directive @aws_api_key on FIELD_DEFINITION | OBJECT
      directive @aws_lambda on FIELD_DEFINITION | OBJECT
      directive @aws_auth(cognito_groups: [String]) on FIELD_DEFINITION | OBJECT
      directive @aws_cognito_user_pools(cognito_groups: [String]) on FIELD_DEFINITION | OBJECT
      directive @aws_subscribe(mutations: [String]) on FIELD_DEFINITION
      directive @canonical on OBJECT
      directive @hidden on OBJECT
      directive @renamed on OBJECT
      scalar AWSDate
      scalar AWSTime
      scalar AWSDateTime
      scalar AWSTimestamp
      scalar AWSEmail
      scalar AWSJSON
      scalar AWSURL
      scalar AWSPhone
      scalar AWSIPAddress
    `

    it('should handle AWS AppSync directives correctly', () => {
      const schema = `
        type Query {
          getUser: User @aws_api_key
        }

        type User @aws_oidc {
          id: ID!
          email: AWSEmail!
          createdAt: AWSDateTime!
        }
      `

      const merged = mergeTypeDefs([AWS_TYPES, schema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('@aws_api_key')
      expect(result).toContain('@aws_oidc')
      expect(result).toContain('AWSEmail')
      expect(result).toContain('AWSDateTime')
    })

    it('should merge multiple schemas with AWS directives', () => {
      const base = `
        type Query
        type Mutation
      `
      const userSchema = `
        extend type Query {
          getUser: User!
        }
        type User {
          id: ID!
          name: String!
          role: String! @aws_oidc
          email: AWSEmail!
        }
      `
      const postSchema = `
        extend type Query {
          getPost(id: ID!): Post!
        }
        type Post @aws_oidc {
          id: ID!
          title: String!
          createdAt: AWSDateTime!
        }
      `

      const merged = mergeTypeDefs([AWS_TYPES, base, userSchema, postSchema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('getUser: User!')
      expect(result).toContain('getPost(id: ID!): Post!')
      expect(result).toContain('role: String! @aws_oidc')
      expect(result).toContain('type Post @aws_oidc')
    })
  })

  describe('edge cases', () => {
    it('should handle empty array input', () => {
      const merged = mergeTypeDefs([], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      // Should return a valid document node
      expect(merged).toBeDefined()
      expect(merged.kind).toBe('Document')
    })

    it('should handle input types and enums', () => {
      const schema = `
        type Query {
          getUser(input: UserInput!): User
        }

        input UserInput {
          name: String!
          role: UserRole!
        }

        enum UserRole {
          ADMIN
          USER
          GUEST
        }

        type User {
          id: ID!
          role: UserRole!
        }
      `

      const merged = mergeTypeDefs([schema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('input UserInput')
      expect(result).toContain('enum UserRole')
      expect(result).toContain('ADMIN')
    })

    it('should handle interfaces and unions', () => {
      const schema = `
        type Query {
          getNode(id: ID!): Node
          search: [SearchResult!]!
        }

        interface Node {
          id: ID!
        }

        type User implements Node {
          id: ID!
          name: String!
        }

        type Post implements Node {
          id: ID!
          title: String!
        }

        union SearchResult = User | Post
      `

      const merged = mergeTypeDefs([schema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('interface Node')
      expect(result).toContain('implements Node')
      expect(result).toContain('union SearchResult = User | Post')
    })

    it('should handle subscriptions', () => {
      const schema = `
        type Query {
          getUser: User
        }

        type Mutation {
          createUser(name: String!): User
        }

        type Subscription {
          userCreated: User @aws_subscribe(mutations: ["createUser"])
        }

        type User {
          id: ID!
          name: String!
        }
      `

      const merged = mergeTypeDefs([schema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('type Subscription')
      expect(result).toContain('userCreated: User')
    })

    it('should preserve field arguments', () => {
      const schema = `
        type Query {
          getUsers(
            limit: Int = 10
            offset: Int = 0
            filter: UserFilter
            sort: [SortInput!]
          ): [User!]!
        }

        input UserFilter {
          name: String
          role: String
        }

        input SortInput {
          field: String!
          order: SortOrder!
        }

        enum SortOrder {
          ASC
          DESC
        }

        type User {
          id: ID!
        }
      `

      const merged = mergeTypeDefs([schema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('limit: Int = 10')
      expect(result).toContain('offset: Int = 0')
      expect(result).toContain('filter: UserFilter')
    })

    it('should preserve descriptions', () => {
      const schema = `
        """
        This is a User type description
        """
        type User {
          """
          The unique identifier
          """
          id: ID!
          # This is a line comment
          name: String!
        }
      `

      const merged = mergeTypeDefs([schema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('This is a User type description')
      expect(result).toContain('The unique identifier')
    })

    it('should handle custom directives correctly', () => {
      // Note: v9.0.4 includes a fix for "directive merging when directive name
      // is inherited from object prototype (i.e. toString)". In v8.x, using
      // "toString" as a directive name would fail with "Invalid AST Node" error.
      const schema = `
        directive @customDirective on FIELD_DEFINITION

        type Query {
          value: String @customDirective
        }
      `

      const merged = mergeTypeDefs([schema], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('@customDirective')
      expect(result).toContain('directive @customDirective on FIELD_DEFINITION')
    })
  })

  describe('parsed DocumentNode input', () => {
    it('should accept parsed DocumentNode as input', () => {
      const typeDefs1 = parse(`
        type Query {
          hello: String
        }
      `)
      const typeDefs2 = parse(`
        type User {
          id: ID!
        }
      `)

      const merged = mergeTypeDefs([typeDefs1, typeDefs2], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('type Query')
      expect(result).toContain('type User')
    })

    it('should accept mixed string and DocumentNode input', () => {
      const typeDefs1 = `
        type Query {
          hello: String
        }
      `
      const typeDefs2 = parse(`
        type User {
          id: ID!
        }
      `)

      const merged = mergeTypeDefs([typeDefs1, typeDefs2], {
        forceSchemaDefinition: false,
        useSchemaDefinition: false,
        sort: true,
        throwOnConflict: true,
      })

      const result = print(merged)
      expect(result).toContain('type Query')
      expect(result).toContain('type User')
    })
  })
})
