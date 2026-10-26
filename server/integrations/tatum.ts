import { SuiGrpcClient } from "@mysten/sui/grpc";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";

export class TatumSuiGateway {
  readonly client: SuiGrpcClient;
  readonly network: "testnet" | "mainnet";
  constructor(apiKey: string, network: "testnet" | "mainnet") {
    if (!apiKey.trim())
      throw new Error("A server-side Tatum API key is required.");
    this.network = network;
    this.client = new SuiGrpcClient({
      network,
      transport: new GrpcTransport({
        host: `sui-${network}-grpc.gateway.tatum.io:443`,
        channelCredentials: ChannelCredentials.createSsl(),
        meta: { "x-api-key": apiKey },
        timeout: 15_000,
      }),
    });
  }
  async checkpoint() {
    const { response } = await this.client.ledgerService.getCheckpoint({
      checkpointId: { oneofKind: undefined },
      readMask: { paths: ["sequence_number", "digest"] },
    });
    if (!response.checkpoint?.digest)
      throw new Error("The provider did not return checkpoint evidence.");
    return {
      provider: "Tatum",
      network: this.network,
      digest: response.checkpoint.digest,
      sequence: String(response.checkpoint.sequenceNumber),
      checkedAt: new Date().toISOString(),
    };
  }
  async object(objectId: string) {
    if (!/^0x[a-fA-F0-9]{1,64}$/.test(objectId))
      throw new Error("Invalid Sui object ID.");
    const result = await this.client.getObject({
      objectId,
      include: { content: true },
    });
    return {
      provider: "Tatum",
      network: this.network,
      checkedAt: new Date().toISOString(),
      object: result.object,
    };
  }
  async receipt(digest: string) {
    const result = await this.client.getTransaction({
      digest,
      include: { effects: true, events: true },
    });
    if (result.FailedTransaction)
      return { state: "failed" as const, digest, network: this.network };
    if (!result.Transaction)
      throw new Error("The transaction outcome is unresolved.");
    return {
      state: "confirmed" as const,
      provider: "Tatum",
      network: this.network,
      transaction: result.Transaction,
    };
  }
}
