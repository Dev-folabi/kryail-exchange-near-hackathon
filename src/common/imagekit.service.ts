import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import ImageKit from "imagekit";

@Injectable()
export class ImageKitService {
  private readonly logger = new Logger(ImageKitService.name);
  private readonly imagekit?: ImageKit;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const publicKey = this.configService.get<string>("imagekit.publicKey");
    const privateKey = this.configService.get<string>("imagekit.privateKey");
    const urlEndpoint = this.configService.get<string>("imagekit.urlEndpoint");

    this.isConfigured = !!(publicKey && privateKey && urlEndpoint);

    if (this.isConfigured && publicKey && privateKey && urlEndpoint) {
      this.imagekit = new ImageKit({
        publicKey,
        privateKey,
        urlEndpoint,
      });
      this.logger.log("ImageKit service initialized successfully");
    } else {
      this.logger.warn(
        "ImageKit not configured. Document upload will be disabled.",
      );
    }
  }

  /**
   * Upload image from URL (e.g., Twilio media URL)
   */
  async uploadFromUrl(
    imageUrl: string,
    fileName: string,
    folder: string = "kyc-documents",
    headers: Record<string, string> = {},
  ): Promise<string> {
    if (!this.isConfigured || !this.imagekit) {
      throw new Error(
        "ImageKit is not configured. Please add ImageKit credentials to environment variables.",
      );
    }

    try {
      this.logger.log(`Uploading image from URL: ${imageUrl}`);

      // Download image from URL
      const response = await fetch(imageUrl, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      // Upload to ImageKit
      const result = await this.imagekit.upload({
        file: base64,
        fileName,
        folder,
        useUniqueFileName: true,
      });

      this.logger.log(`Image uploaded successfully: ${result.url}`);
      return result.url;
    } catch (error) {
      this.logger.error("Failed to upload image to ImageKit:", error);

      Sentry.captureException(error, {
        tags: {
          service: "imagekit",
          action: "upload_from_url",
        },
        extra: {
          imageUrl,
          fileName,
        },
      });

      throw error;
    }
  }

  /**
   * Upload base64 image
   */
  async uploadBase64(
    base64Image: string,
    fileName: string,
    folder: string = "kyc-documents",
  ): Promise<string> {
    if (!this.isConfigured || !this.imagekit) {
      throw new Error(
        "ImageKit is not configured. Please add ImageKit credentials to environment variables.",
      );
    }

    try {
      this.logger.log(`Uploading base64 image: ${fileName}`);

      const result = await this.imagekit.upload({
        file: base64Image,
        fileName,
        folder,
        useUniqueFileName: true,
      });

      this.logger.log(`Image uploaded successfully: ${result.url}`);
      return result.url;
    } catch (error) {
      this.logger.error("Failed to upload base64 image to ImageKit:", error);

      Sentry.captureException(error, {
        tags: {
          service: "imagekit",
          action: "upload_base64",
        },
        extra: {
          fileName,
        },
      });

      throw error;
    }
  }

  /**
   * Check if ImageKit is configured
   */
  isAvailable(): boolean {
    return this.isConfigured;
  }
}
