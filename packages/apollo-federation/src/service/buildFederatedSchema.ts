import { DocumentNode, GraphQLSchema, specifiedDirectives } from 'graphql';
import {
  buildSchemaFromSDL,
  GraphQLSchemaModule,
  modulesFromSDL,
  GraphQLResolverMap,
} from 'apollo-graphql';
import federationDirectives from '../directives';

import 'apollo-server-env';
import { transformFederatedSchema } from './transformFederatedSchema';
import { extractFederationResolvers } from './extractFederationResolvers';

type LegacySchemaModule = {
  typeDefs: DocumentNode | DocumentNode[];
  resolvers?: GraphQLResolverMap<any>;
};

export function buildFederatedSchema(
  modulesOrSDLOrSchema:
    | (GraphQLSchemaModule | DocumentNode)[]
    | DocumentNode
    | GraphQLSchema
    | LegacySchemaModule,
): GraphQLSchema {
  // Extract federation specific resolvers from already constructed
  // GraphQLSchema and transform it to a federated schema.
  if (modulesOrSDLOrSchema instanceof GraphQLSchema) {
    return transformFederatedSchema(modulesOrSDLOrSchema, [
      extractFederationResolvers(modulesOrSDLOrSchema),
    ]);
  }

  // ApolloServer supports passing an array of DocumentNode along with a single
  // map of resolvers to build a schema. Long term we don't want to support this
  // style anymore as we move towards a more structured approach to modules,
  // however, it has tripped several teams up to not support this signature
  // in buildFederatedSchema. Especially as teams migrate from
  // `new ApolloServer({ typeDefs: DocumentNode[], resolvers })` to
  // `new ApolloServer({ schema: buildFederatedSchema({ typeDefs: DocumentNode[], resolvers }) })`
  //
  // The last type in the union for `modulesOrSDL` supports this "legacy" input
  // style in a simple manner (by just adding the resolvers to the first typeDefs entry)
  //
  let shapedModulesOrSDL: (GraphQLSchemaModule | DocumentNode)[] | DocumentNode;
  if ('typeDefs' in modulesOrSDLOrSchema) {
    const { typeDefs, resolvers } = modulesOrSDLOrSchema;
    const augmentedTypeDefs = Array.isArray(typeDefs) ? typeDefs : [typeDefs];
    shapedModulesOrSDL = augmentedTypeDefs.map((typeDefs, i) => {
      const module: GraphQLSchemaModule = { typeDefs };
      // add the resolvers to the first "module" in the array
      if (i === 0 && resolvers) module.resolvers = resolvers;
      return module;
    });
  } else {
    shapedModulesOrSDL = modulesOrSDLOrSchema;
  }

  const modules = modulesFromSDL(shapedModulesOrSDL);

  const resolvers = modules
    .filter(module => !!module.resolvers)
    .map(module => module.resolvers as GraphQLResolverMap<any>);

  return transformFederatedSchema(
    buildSchemaFromSDL(
      modules,
      new GraphQLSchema({
        query: undefined,
        directives: [...specifiedDirectives, ...federationDirectives],
      }),
    ),
    resolvers,
  );
}
