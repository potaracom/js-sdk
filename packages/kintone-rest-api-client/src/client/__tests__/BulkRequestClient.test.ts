import { MockClient } from "../../http/MockClient";
import { BulkRequestClient } from "../BulkRequestClient";

describe("BulkRequestClient", () => {
  let mockClient: MockClient;
  let bulkRequestClient: BulkRequestClient;
  const APP_ID = 1;
  const RECORD_ID = 2;
  const fieldCode = "Customer";
  const record = {
    [fieldCode]: {
      value: "ABC Corporation"
    }
  };

  beforeEach(() => {
    mockClient = new MockClient();
    bulkRequestClient = new BulkRequestClient(mockClient);
  });
  describe("request", () => {
    const params = {
      requests: [
        {
          method: "POST",
          api: "/k/v1/record.json",
          payload: {
            app: APP_ID,
            record
          }
        },
        {
          method: "DELETE",
          api: "/k/v1/records.json",
          payload: {
            app: APP_ID,
            ids: [RECORD_ID]
          }
        }
      ]
    };
    beforeEach(() => {
      bulkRequestClient.request(params);
    });
    it("should pass the path to the http client", () => {
      expect(mockClient.getLogs()[0].path).toBe("/k/v1/bulkRequest.json");
    });
    it("should send a post request", () => {
      expect(mockClient.getLogs()[0].method).toBe("post");
    });
    it("should pass requests to the http client", () => {
      expect(mockClient.getLogs()[0].params).toEqual(params);
    });
  });
});
