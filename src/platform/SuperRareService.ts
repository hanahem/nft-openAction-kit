import { PublicClient, createPublicClient, getContract, http } from "viem";
import { NFTExtraction, ServiceConfig, UIData } from "..";
import ERC721ABI from "../config/abis/ERC721.json";
import OwnableABI from "../config/abis/Ownable.json";
import SuperRareMarketplaceABI from "../config/abis/SuperRare/SuperRareMarketplace.json";
import SuperRareV2ABI from "../config/abis/SuperRare/SuperRareV2.json";
import { ZERO_ADDRESS } from "../config/constants";
import { IPlatformService } from "../interfaces/IPlatformService";

export const SUPER_RARE_ADDRESS = "0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0";
export const SUPER_RARE_MINTER_ADDRESS =
  "0x6D7c44773C52D396F43c2D511B81aa168E9a7a42";

export class SuperRareService implements IPlatformService {
  readonly platformName: string;
  readonly platformLogoUrl: string;

  private client: PublicClient;

  private mintSignature =
    "function buy(address _originContract, uint256 _tokenId, address _currencyAddress, uint256 _amount) external payable";

  constructor(config: ServiceConfig) {
    this.client = createPublicClient({
      chain: config.chain,
      transport: http(),
    });

    this.platformName = config.platformName;
    this.platformLogoUrl = config.platformLogoUrl;
  }

  getMinterAddress(
    contract: string,
    tokenId: bigint
  ): Promise<string | undefined> {
    return Promise.resolve(SUPER_RARE_MINTER_ADDRESS);
  }

  async getMintSignature(
    nftDetails: NFTExtraction
  ): Promise<string | undefined> {
    const salePrice = await this.getSalePrices(
      nftDetails.contractAddress,
      BigInt(nftDetails.nftId)
    );

    if (!this.isSaleValid(salePrice)) return;

    return Promise.resolve(this.mintSignature);
  }

  async getUIData(
    signature: string,
    contract: string,
    tokenId: bigint,
    dstChainId: bigint,
    sourceUrl: string
  ): Promise<UIData | undefined> {
    let sellAddress = SUPER_RARE_ADDRESS;
    if (sourceUrl) {
      const contractMatch = sourceUrl.match(
        /https:\/\/superrare\.com\/(0x[a-fA-F0-9]{40})/
      );
      if (contractMatch) {
        sellAddress = contractMatch[1];
      }
    }
    const nftContract = getContract({
      address: sellAddress as `0x${string}`,
      abi: ERC721ABI,
      client: this.client,
    });

    let owner: any | undefined;
    if (sellAddress.toLowerCase() === SUPER_RARE_ADDRESS.toLowerCase()) {
      const superRareContract = getContract({
        address: sellAddress as `0x${string}`,
        abi: SuperRareV2ABI,
        client: this.client,
      });

      owner = await superRareContract.read.tokenCreator([tokenId]);
    } else {
      try {
        owner = await this.client.readContract({
          address: sellAddress as `0x${string}`,
          abi: OwnableABI,
          functionName: "owner",
        });
      } catch (error) {
        console.log("Not ownable contract, nftCreatorAddress not found");
      }
    }

    const tokenURI: any = await nftContract.read.tokenURI([tokenId]);
    // fetch json from tokenURI
    const tokenData = await fetch(tokenURI);

    if (!tokenData.ok) {
      throw new Error("Token data not found");
    }

    const tokenJson: any = await tokenData.json();

    if (!tokenJson.name) {
      throw new Error("Collection name not found");
    }

    if (!tokenJson.image) {
      throw new Error("Preview asset url not found");
    }

    return {
      platformName: this.platformName,
      platformLogoUrl: this.platformLogoUrl,
      nftName: tokenJson.name,
      nftUri: tokenJson.image,
      tokenStandard: "erc721",
      ...(owner ? { nftCreatorAddress: owner } : {}),
      dstChainId: Number(dstChainId),
    };
  }

  async getPrice(
    contractAddress: string,
    nftId: bigint,
    signature: string,
    userAddress: string,
    unit: bigint = 1n,
    sourceUrl?: string
  ): Promise<bigint | undefined> {
    let sellAddress = SUPER_RARE_ADDRESS;
    if (sourceUrl) {
      const contractMatch = sourceUrl.match(
        /https:\/\/superrare\.com\/(0x[a-fA-F0-9]{40})/
      );
      if (contractMatch) {
        sellAddress = contractMatch[1];
      }
    }

    const salePrice = await this.getSalePrices(sellAddress, nftId);

    if (!this.isSaleValid(salePrice)) return;

    return (
      ((salePrice!.price * this.getFees()) / 100n + salePrice!.price) * unit
    );
  }

  getArgs(
    contractAddress: string,
    tokenId: bigint,
    senderAddress: string,
    signature: string,
    price: bigint,
    quantity: bigint,
    profileOwnerAddress: string,
    sourceUrl: string
  ): Promise<any[]> {
    let sellAddress = SUPER_RARE_ADDRESS;
    if (sourceUrl) {
      const contractMatch = sourceUrl.match(
        /https:\/\/superrare\.com\/(0x[a-fA-F0-9]{40})/
      );
      if (contractMatch) {
        sellAddress = contractMatch[1];
      }
    }
    return Promise.resolve([sellAddress, tokenId, ZERO_ADDRESS, price]);
  }

  private async getSalePrices(
    contractAddress: string,
    nftId: bigint
  ): Promise<{ price: bigint; token: string; seller: string } | undefined> {
    const superRareServiceContract = getContract({
      address: SUPER_RARE_MINTER_ADDRESS as `0x${string}`,
      abi: SuperRareMarketplaceABI,
      client: this.client,
    });

    const salePrice: any = await superRareServiceContract.read.tokenSalePrices([
      contractAddress,
      nftId,
      ZERO_ADDRESS,
    ]);

    if (!salePrice || salePrice.length !== 3) {
      return;
    }

    return {
      price: BigInt(salePrice[2]),
      token: salePrice[2],
      seller: salePrice[0],
    };
  }

  isSaleValid(
    salePrice: { price: bigint; token: string; seller: string } | undefined
  ): boolean {
    if (!salePrice) {
      return false;
    }

    if (salePrice.price === 0n) {
      return false;
    }
    return true;
  }

  private getFees(): bigint {
    // All fees
    // https://help.superrare.com/en/articles/5662523-what-is-the-fee-structure-on-superrare
    return 3n; // 3%
  }
}
