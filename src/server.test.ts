const listenMock = jest.fn();
const dotenvMock = jest.fn();

jest.mock("./app", () => ({ __esModule: true, default: { listen: listenMock } }));
jest.mock("dotenv/config", () => dotenvMock());

const loadServer = () => {
  jest.isolateModules(() => {
    require("./server");
  });
};

describe("server", () => {
  const ORIGINAL_ENV = process.env;
  let consoleLog: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PORT;
    consoleLog = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLog.mockRestore();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("loads the environment variables before starting", () => {
    dotenvMock.mockImplementation(() => {
      process.env.PORT = "4000";
      return {};
    });

    loadServer();

    expect(dotenvMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledWith(4000, expect.any(Function));
    dotenvMock.mockReset();
  });

  it.each([
    [undefined, 3000],
    ["", 3000],
    ["abc", 3000],
    ["5000", 5000]
  ])("listens on the right port when PORT is %p", (port, expected) => {
    if (port !== undefined) {
      process.env.PORT = port;
    }

    loadServer();

    expect(listenMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledWith(expected, expect.any(Function));
  });

  it("logs the port only after the server is up", () => {
    process.env.PORT = "5000";

    loadServer();
    expect(consoleLog).not.toHaveBeenCalled();

    listenMock.mock.calls[0][1]();
    expect(consoleLog).toHaveBeenCalledWith("API running on port 5000");
  });
});
