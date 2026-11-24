const prismaClientMock = jest.fn();

jest.mock("@prisma/client", () => ({ PrismaClient: prismaClientMock }));

const globalForPrisma = global as typeof global & { prisma?: unknown };

const loadPrisma = (): unknown => {
  let loaded: unknown;

  jest.isolateModules(() => {
    loaded = require("./prisma").prisma;
  });

  return loaded;
};

describe("prisma", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "development" };
    delete globalForPrisma.prisma;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    delete globalForPrisma.prisma;
  });

  it("creates the client logging errors and warnings", () => {
    const prisma = loadPrisma();

    expect(prismaClientMock).toHaveBeenCalledTimes(1);
    expect(prismaClientMock).toHaveBeenCalledWith({ log: ["error", "warn"] });
    expect(prisma).toBe(prismaClientMock.mock.instances[0]);
  });

  it("reuses the same client when the module is reloaded outside production", () => {
    const first = loadPrisma();
    const second = loadPrisma();

    expect(second).toBe(first);
    expect(globalForPrisma.prisma).toBe(first);
    expect(prismaClientMock).toHaveBeenCalledTimes(1);
  });

  it("uses a client already stored in global", () => {
    const existing = {};
    globalForPrisma.prisma = existing;

    expect(loadPrisma()).toBe(existing);
    expect(prismaClientMock).not.toHaveBeenCalled();
  });

  it("does not store the client in global in production", () => {
    process.env.NODE_ENV = "production";

    loadPrisma();

    expect(prismaClientMock).toHaveBeenCalledTimes(1);
    expect(globalForPrisma.prisma).toBeUndefined();
  });
});
