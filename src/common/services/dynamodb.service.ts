import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

@Injectable()
export class DynamoDbService {
  private readonly logger = new Logger(DynamoDbService.name);
  private readonly dynamoClient: DynamoDBClient | null;
  private readonly docClient: DynamoDBDocumentClient | null;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    
    // Check if DynamoDB is properly configured
    this.isConfigured = !!(
      accessKeyId && 
      secretAccessKey && 
      accessKeyId !== 'your-aws-access-key' && 
      secretAccessKey !== 'your-aws-secret-key'
    );

    if (this.isConfigured) {
      try {
        // Initialize DynamoDB client with credentials from environment
        this.dynamoClient = new DynamoDBClient({
          region: this.configService.get<string>('AWS_DYNAMODB_REGION', 'us-east-1'),
          credentials: {
            accessKeyId: accessKeyId!,
            secretAccessKey: secretAccessKey!,
          },
        });

        this.docClient = DynamoDBDocumentClient.from(this.dynamoClient);
      } catch (error) {
        this.logger.error('❌ Failed to initialize DynamoDB client:', error.message);
        this.dynamoClient = null;
        this.docClient = null;
      }
    } else {
      this.logger.warn('⚠️ DynamoDB not configured (missing or placeholder AWS credentials) - logging will be disabled');
      this.dynamoClient = null;
      this.docClient = null;
    }
  }

  /**
   * Put item to DynamoDB table
   */
  async putItem(tableName: string, item: any): Promise<void> {
    if (!this.isConfigured || !this.docClient) {
      return;
    }

    try {
      const command = new PutCommand({
        TableName: tableName,
        Item: item,
      });

      await this.docClient.send(command);
    } catch (error) {
      this.logger.error(`Failed to put item to ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get item from DynamoDB table
   */
  async getItem(tableName: string, key: any): Promise<any> {
    if (!this.isConfigured || !this.docClient) {
      return null;
    }

    try {
      const command = new GetCommand({
        TableName: tableName,
        Key: key,
      });

      const result = await this.docClient.send(command);
      return result.Item;
    } catch (error) {
      this.logger.error(`Failed to get item from ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Query items from DynamoDB table
   */
  async queryItems(
    tableName: string, 
    keyConditionExpression: string, 
    expressionAttributeValues: any,
    expressionAttributeNames?: any,
    limit?: number
  ): Promise<any[]> {
    if (!this.isConfigured || !this.docClient) {
      return [];
    }

    try {
      const command = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        Limit: limit,
      });

      const result = await this.docClient.send(command);
      return result.Items || [];
    } catch (error) {
      this.logger.error(`Failed to query items from ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update item in DynamoDB table
   */
  async updateItem(
    tableName: string, 
    key: any, 
    updateExpression: string, 
    expressionAttributeValues: any,
    expressionAttributeNames?: any
  ): Promise<any> {
    if (!this.isConfigured || !this.docClient) {
      return null;
    }

    try {
      const command = new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: 'ALL_NEW',
      });

      const result = await this.docClient.send(command);
      return result.Attributes;
    } catch (error) {
      this.logger.error(`Failed to update item in ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Scan items from DynamoDB table
   */
  async scanItems(
    tableName: string,
    filterExpression?: string,
    expressionAttributeValues?: any,
    expressionAttributeNames?: any,
    limit?: number
  ): Promise<any[]> {
    if (!this.isConfigured || !this.docClient) {
      return [];
    }

    try {
      const command = new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        Limit: limit,
      });

      const result = await this.docClient.send(command);
      return result.Items || [];
    } catch (error) {
      this.logger.error(`Failed to scan items from ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Check if DynamoDB is properly configured
   */
  public isAvailable(): boolean {
    return this.isConfigured && !!this.docClient;
  }
}
