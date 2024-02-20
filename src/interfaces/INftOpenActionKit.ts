import { ActionData, PublicationInfo } from "..";

export interface INftOpenActionKit {
  detectAndReturnCalldata(contentURI: string): Promise<string | undefined>;

  actionDataFromPost(
    post: PublicationInfo,
    profileId: string,
    senderAddress: string,
    srcChainId: string
  ): Promise<ActionData>;
}