# @toopro/utils

This library provides a versatile type-casting utility for objects, with features for schema validation and deep casting.

## Installation

```bash
npm install @toopro/utils
```

## Usage

The main export of this library is the `TpsCaster` class.

### TpsCaster

The `TpsCaster` class provides a static `cast` method that takes an object and an options object. It returns a new object with the specified fields cast to the desired types.

**Example:**

```typescript
import { TpsCaster } from '@toopro/utils';

const obj = {
  id: '123',
  price: '123.45',
  date: '2021-01-01',
  is_active: 'true',
  data: '{"key": "value"}'
};

// With all caster options turned on, we will have:
const ent = TpsCaster.cast(obj, {enableAll: true});

// ent will be:
// {
//   id: 123,
//   price: 123.45,
//   date: new Date('2021-01-01'),
//   is_active: true,
//   data: {key: 'value'}
// };
```

### TpsCasterOptions

The `TpsCasterOptions` class allows you to configure the casting behavior. You can specify which types of conversions to perform, and you can also provide a schema for validation.

**Options:**

*   `enableAll`: A shortcut to enable all casting options.
*   `onlySchema`: Whether to only process fields that are in the schema.
*   `rewriteFields`: Whether to update the existing object's fields or create a copy with cast values.
*   `stringsToNumbers`: Whether to try converting all strings to numbers.
*   `numberMaxChars`: The maximum number of characters in a string to try converting it to a number.
*   `stringsToDates`: Whether to try converting all strings to dates.
*   `datesMatchRegex`: A regex to match before trying to convert a string to a date.
*   `stringsToBooleans`: Whether to try converting all strings to booleans.
*   `stringsToObjects`: Whether to try converting all strings to objects.
*   `schema`: A schema to validate the fields against.
*   `deepCasters`: A map of field names to `TpsCasterOptions` objects for deep casting.

**Example with options:**

```typescript
import { TpsCaster, TpsCasterOptions } from '@toopro/utils';

const obj = {
  id: '123',
  price: '123.45',
  is_active: 'true',
};

const options = new TpsCasterOptions({
  stringsToNumbers: true,
  stringsToBooleans: true,
  schema: {
    id: 'number',
    price: 'number',
    is_active: 'boolean'
  }
});

const ent = TpsCaster.cast(obj, options);
```

## Building and Publishing

To build the library, run:

```bash
npm run build
```

To publish the library to npm, run:

```bash
npm publish
```
