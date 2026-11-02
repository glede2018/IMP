export function fixtureAccess(role: string, organizationId: string) {
  const permissions =
    role === "admin"
      ? ["*"]
      : [
          "home",
          "accounts",
          "assets",
          "templates",
          "works",
          "analytics",
          "help",
          ...(role === "operator"
            ? [
                "accounts:write",
                "assets:write",
                "templates:write",
                "works:write",
              ]
            : []),
        ];
  return {
    username: `${organizationId}_${role}`,
    assignments: {
      create: {
        role: {
          create: {
            organizationId,
            name: role,
            code: role,
            system: role === "admin",
            permissions,
          },
        },
      },
    },
  };
}
