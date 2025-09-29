# @toopro/db

A robust and flexible TypeScript library designed to streamline interactions with various database backends, with a primary and comprehensive implementation for Directus. It simplifies data management, authentication, and querying, making it an excellent choice for applications built with NestJS, Angular, or other TypeScript/JavaScript frameworks.

[![npm version](https://badge.fury.io/js/@toopro%2Fdb.svg)](https://badge.fury.io/js/@toopro%2Fdb)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/slyk/tps-npm)

## Features

- **Multi-Server Management**: Seamlessly connect and manage multiple database servers through a centralized broker.
- **Directus Integration**: First-class support for Directus, leveraging its SDK for efficient data operations.
- **Type-Safe**: Built with TypeScript, providing strong typing for your data models and queries.
- **Fluent Query Builder**: Construct complex queries using an intuitive and chainable API (`dbqb`).
- **Entity Service Abstraction**: Define services for your entities that encapsulate CRUD operations and business logic.
- **Authentication Handling**: Manages login, logout, and token refresh, with automatic re-login attempts on authentication failures.
- **Caching Layer**: Improve performance by caching query results locally.
- **Deep Field Loading**: Fetch related data from other entities or even other servers with ease.
- **Error Handling**: Comprehensive error management with options to throw exceptions or return error strings.
- **Extensible Architecture**: Designed to be extended for other database types beyond Directus.

## Installation

```bash
npm install @toopro/db
```

## Quick Start

This guide will walk you through setting up `@toopro/db` in a typical application.

### 1. Configure the DB_BrokerService

The `DB_BrokerService` is the heart of `@toopro/db`, managing your server connections. You'll typically initialize it in a central module of your application.

**Example for NestJS/Angular Module:**

```typescript
import { NgModule } from '@angular/core';
import { DB_BrokerService, DB_ServerNamesStd, IsLoginStatus, ServersConfigHash, DBtype } from '@toopro/db';

// Define your server configuration
const serverConfig: ServersConfigHash = {
  credentials: {
    [DB_ServerNamesStd.core]: {
      name: DB_ServerNamesStd.core,
      url: 'https://your-core-directus-instance.com',
      login: 'your-email@example.com',
      password: 'your-password',
      // or token: 'your-static-token',
      type: DBtype.directus,
    },
    [DB_ServerNamesStd.work]: {
      name: DB_ServerNamesStd.work,
      url: 'https://your-work-directus-instance.com',
      token: 'your-work-token', // Example using a token
      type: DBtype.directus,
    },
  },
  entitiesByServer: {
    [DB_ServerNamesStd.core]: ['posts', 'users', 'categories'],
    [DB_ServerNamesStd.work]: ['projects', 'tasks'],
  },
};

@NgModule({
  // ... other module properties
  providers: [
    {
      provide: DB_BrokerService,
      useFactory: () => new DB_BrokerService(serverConfig),
    },
    // ... your entity services
  ],
  // ...
})
export class AppModule {}
```

### 2. Create an Entity Service

Create a service for each of your entities by extending `DB_EntityServiceBase_Directus`. This service will handle all data operations for that entity.

**Example: `PostService`**

```typescript
import { Injectable } from '@angular/core';
import { DB_EntityServiceBase_Directus, DB_BrokerService, DB_EntityService_Options } from '@toopro/db';

// Define your Post type (ideally from generated types if possible)
export interface Post {
  id: number;
  title: string;
  content: string;
  author_id: number;
  status: 'published' | 'draft';
  date_created: string;
}

@Injectable()
export class PostService extends DB_EntityServiceBase_Directus<Post> {
  constructor(
    dbBroker: DB_BrokerService,
  ) {
    // The entity name 'posts' should match the collection name in Directus.
    // The broker will automatically find the correct server based on the configuration.
    super('posts', dbBroker, {
      // Optional: Configure service-level settings
      readonly: false, // Set to true if this service should only perform read operations
      throwErrors: false, // Set to true to throw exceptions on error
      verboseLevel: 2, // DB_VerboseLevel.INFO
      errorsToConsole: true,
      // Optional: Add a post-load modifier to transform data after fetching
      // postLoadModifier: (post: Post) => { post.title = post.title.toUpperCase(); return post; },
      // Optional: Configure TpsCaster for automatic type casting
      // casterOpts: { /* TpsCasterOptions */ }
    });
  }

  // You can add custom methods specific to your Post entity here
  async getPublishedPosts() {
    return this.query(dbqb<Post>().equal('status', 'published').sort(['-date_created']));
  }

  async getPostWithAuthor(postId: number) {
    // Example of fetching a post and its author (assuming author is a relational field)
    // This requires 'author.*' to be requested or handled by deepFields if author is on another server.
    return this.queryOne(dbqb<Post>().equal('id', postId).fields(['*', 'author.*']));
  }
}
```

**Important:** Ensure your `PostService` (and other entity services) are provided by your dependency injection system (e.g., in an Angular module's `providers` array or a NestJS module's `providers`).

### 3. Use Your Entity Service

Now you can inject and use your `PostService` in your components or other services.

**Example in an Angular Component:**

```typescript
import { Component, OnInit } from '@angular/core';
import { PostService, Post } from './post.service';

@Component({
  selector: 'app-post-list',
  template: `
    <div *ngIf="posts.length > 0; else noPosts">
      <div *ngFor="let post of posts">
        <h2>{{ post.title }}</h2>
        <p>{{ post.content }}</p>
      </div>
    </div>
    <ng-template #noPosts>
      <p>No posts found.</p>
    </ng-template>
  `
})
export class PostListComponent implements OnInit {
  posts: Post[] = [];

  constructor(private postService: PostService) {}

  async ngOnInit() {
    try {
      this.posts = await this.postService.getAll();
      // Or use a custom query:
      // this.posts = await this.postService.getPublishedPosts();
    } catch (error) {
      console.error('Failed to load posts:', error);
      // Handle error appropriately (e.g., show a message to the user)
    }
  }
}
```

## Query Builder (`dbqb` or `DB_Query.qb`)

The query builder provides a fluent, chainable API for constructing database queries. It helps in building complex queries in a readable and maintainable way.

### Creating a Query

```typescript
import { dbqb, DBtype } from '@toopro/db';
import { Post } from './post.service';

// Start building a query
const queryBuilder = dbqb<Post>();
```

### Chaining Methods

You can chain various methods to define your query parameters.

```typescript
const q = dbqb<Post>()
  .fields(['id', 'title', 'author.name']) // Select specific fields (including relational fields)
  .equal('status', 'published')           // Filter: status equals 'published'
  .greater('author_id', 10)               // Filter: author_id is greater than 10
  .in('id', [1, 5, 10])                   // Filter: id is in the array [1, 5, 10]
  .sort(['-date_created', 'title'])       // Sort by date_created descending, then title ascending
  .limit(20)                              // Limit to 20 results
  .offset(0);                             // Offset for pagination

// For internal service query() methods, .for() is optional if the defaultDBType is set.
// The full DB_Query object can be passed to the query() function.
const queryObject = q.for(DBtype.directus); // Explicitly compile for Directus
```

### Using the Query

Pass the query builder instance or the compiled query object to your service's `query` method.

```typescript
// Using the query builder instance directly
const posts = await this.postService.query(q);

// Using the compiled query object
// const posts = await this.postService.query(queryObject);
```

### Available Query Builder Methods

-   **Selection**:
    -   `fields(fieldList: string[] | DB_FieldPath<T,Depth>[])`: Specifies which fields to return. Supports dot notation for nested fields (e.g., `author.name`).
    -   `fieldAdd(field: string | DB_FieldPath<T,Depth>)`: Adds a single field to the existing list of fields.
-   **Filtering**:
    -   `equal(field, value)`: Field equals the value.
    -   `not(field, value)`: Field does not equal the value.
    -   `in(field, values[])`: Field value is in the provided array.
    -   `notIn(field, values[])`: Field value is not in the provided array.
    -   `isNull(field)`: Field is null.
    -   `isNotNull(field)`: Field is not null.
    -   `greater(field, value)`: Field is greater than the value.
    -   `greaterOrEqual(field, value)`: Field is greater than or equal to the value.
    -   `less(field, value)`: Field is less than the value.
    -   `lessOrEqual(field, value)`: Field is less than or equal to the value.
    -   `contains(field, value, caseInsensitive?)`: Field contains the string.
-   **Pagination & Sorting**:
    -   `limit(value?)`: Limits the number of results.
    -   `offset(value?)`: Sets the offset for pagination.
    -   `sort(sortList: string[] | string)`: Sets the sort order. Prefix with `-` for descending (e.g., `['-date_created', 'name']`).
-   **Advanced**:
    -   `fieldQuery(field, subQuery)`: Defines a sub-query for a relational field (analogous to Directus's `deep` query).
    -   `skipCache(skip?: boolean)`: If `true`, bypasses the cache and forces a request to the server.
    -   `for(dbType?: DBtype)`: Compiles the query builder into a raw query object for the specified database type.

## Error Handling

`@toopro/db` provides a structured way to handle errors through the `DB_Error` class.

### Default Behavior

By default (`throwErrors: false` in service options), service methods like `query`, `add`, `update`, etc., will return an error string on failure. You can check the `lastError` property on the service instance for more details.

```typescript
const result = await this.postService.add(newPost);
if (typeof result === 'string') {
  console.error('Failed to add post:', this.postService.lastError);
  // Handle the error string
} else {
  console.log('Post added successfully:', result);
}
```

### Throwing Exceptions

If you prefer exceptions, set `throwErrors: true` in the service options.

```typescript
// In PostService constructor:
super('posts', dbBroker, { throwErrors: true });

// In your component/service:
try {
  const post = await this.postService.getById(postId);
  console.log('Post:', post);
} catch (error) {
  if (error instanceof DB_Error) {
    console.error('DB Error occurred:', error.message, error.details);
  } else {
    console.error('An unexpected error occurred:', error);
  }
}
```

## Deep Field Loading

For scenarios where related entities reside on different servers or require complex fetching logic, you can configure `deepFields`. This allows the service to automatically fetch these related entities in separate requests.

**Example: Loading user data from a different server**

Assume `posts` are on the `core` server, but `users` (authors) are on the `work` server.

```typescript
@Injectable()
export class PostService extends DB_EntityServiceBase_Directus<Post> {
  constructor(dbBroker: DB_BrokerService) {
    super('posts', dbBroker);

    // Configure deep fields
    this.deepFields = {
      // Key 'author' should match the relational field name in your 'posts' collection.
      // Value 'users' is the entity name on the 'work' server.
      'author': 'users',
    };
  }

  async getPostWithAuthor(postId: number) {
    // When querying, if 'author.*' is requested, the service will:
    // 1. Fetch the post from the 'core' server.
    // 2. Identify the 'author_id'.
    // 3. Use the broker to get the 'UserService' for the 'users' entity on the 'work' server.
    // 4. Fetch the author data using that service.
    // 5. Merge the author data back into the post object.
    const post = await this.queryOne(dbqb<Post>().equal('id', postId).fields(['*', 'author.*']));
    return post; // post.author will be the populated user object
  }
}
```
Ensure the `UserService` for the `users` entity on the `work` server is also initialized and known to the broker.

## Caching

The library includes a basic caching mechanism (`CacheBaseService`) to reduce redundant requests.

### Enabling Cache

You can enable and configure caching for your entity service.

```typescript
@Injectable()
export class PostService extends DB_EntityServiceBase_Directus<Post> {
  constructor(dbBroker: DB_BrokerService) {
    super('posts', dbBroker);
    // Enable cache, index by 'status' and 'author_id', use 'id' as the primary key, max 100 items
    this.cacheEnable(['status', 'author_id'], 'id', 100);
  }
}
```

### How it Works

-   When you perform a query (e.g., `getById`, `getByField`, `query`), the service first checks if the data can be satisfied from the cache.
-   Queries that filter by the indexed fields or by the primary ID can often be resolved from the cache.
-   If data is fetched from the server, it's automatically stored in the cache.
-   Use `skipCache(true)` in the query builder to bypass the cache for a specific request.

## API Reference

For a detailed list of all classes, interfaces, and methods, please refer to the type definitions within the library's source code, primarily in the `src/lib/types/` and `src/lib/` directories.

Key classes and interfaces include:
-   `DB_BrokerService`: Manages server connections and configurations.
-   `DB_EntityServiceBase<T>`: Abstract base class for entity services.
-   `DB_EntityServiceBase_Directus<T>`: Directus-specific implementation of the entity service.
-   `DB_QueryBuilder<T>`: Interface for the fluent query builder.
-   `DB_Query<T>`: Class implementing the query builder.
-   `dbqb<T>()`: Shortcut function to create a new `DB_QueryBuilder`.
-   `DB_Error`: Custom error class for database operations.
-   `DB_ServerInfo`, `DB_Credentials`, `ServersConfigHash`: Types for server configuration.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Release Notes

See [release_notes.md](release_notes.md) for a list of changes in each version.
