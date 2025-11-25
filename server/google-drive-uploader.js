import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

let connectionSettings;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings) {
    throw new Error('Google Drive not connected');
  }

  const accessToken = connectionSettings?.settings?.access_token ?? connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('Google Drive not connected');
  }
  return accessToken;
}

async function getGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

function sanitizeFolderName(name) {
  const nameStr = String(name || 'Unknown');
  return nameStr
    .replace(/\//g, '-')
    .replace(/\\/g, '-')
    .replace(/\0/g, '')
    .trim();
}

function escapeQueryString(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder(folderName, parentFolderId = null) {
  const drive = await getGoogleDriveClient();
  
  const sanitizedName = sanitizeFolderName(folderName);
  const escapedName = escapeQueryString(sanitizedName);

  let query = `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (response.data.files && response.data.files.length > 0) {
    console.log(`📁 Found existing folder: ${sanitizedName} (${response.data.files[0].id})`);
    return response.data.files[0].id;
  }

  const fileMetadata = {
    name: sanitizedName,
    mimeType: 'application/vnd.google-apps.folder'
  };

  if (parentFolderId) {
    fileMetadata.parents = [parentFolderId];
  }

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, name'
  });

  console.log(`📁 Created new folder: ${sanitizedName} (${folder.data.id})`);
  return folder.data.id;
}

async function findOrCreateNestedFolders(companyName, saleName) {
  console.log(`📂 Creating folder structure: Product Images > ${companyName} > ${saleName}`);
  
  const productImagesFolderId = await findOrCreateFolder('Product Images');
  const companyFolderId = await findOrCreateFolder(companyName, productImagesFolderId);
  const saleFolderId = await findOrCreateFolder(saleName, companyFolderId);
  
  return saleFolderId;
}

export async function uploadToGoogleDrive(filePathOrConfig, fileName, companyName, saleName) {
  try {
    let actualFileName, mediaBody, folderId;
    
    if (typeof filePathOrConfig === 'object' && filePathOrConfig !== null) {
      const config = filePathOrConfig;
      actualFileName = config.fileName;
      const mimeType = config.mimeType || 'image/jpeg';
      
      if (config.fileBuffer) {
        const { Readable } = await import('stream');
        mediaBody = Readable.from(config.fileBuffer);
      } else if (config.filePath) {
        mediaBody = fs.createReadStream(config.filePath);
      } else {
        throw new Error('Either fileBuffer or filePath must be provided');
      }
      
      console.log(`☁️  Uploading to Google Drive: ${actualFileName}`);
      const drive = await getGoogleDriveClient();
      
      if (config.folderPath) {
        const parts = config.folderPath.split('/').filter(Boolean);
        let parentId = null;
        for (const part of parts) {
          parentId = await findOrCreateFolder(part, parentId);
        }
        folderId = parentId;
      } else {
        folderId = await findOrCreateNestedFolders(config.companyName || 'Unknown', config.saleName || 'Unknown');
      }
      
      const fileMetadata = {
        name: actualFileName,
        parents: [folderId]
      };
      
      const media = {
        mimeType,
        body: mediaBody
      };
      
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink'
      });
      
      console.log(`✅ Uploaded to Google Drive: ${response.data.name}`);
      console.log(`   View link: ${response.data.webViewLink}`);
      
      return {
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink
      };
    }
    
    console.log(`☁️  Uploading to Google Drive: ${fileName}`);

    const drive = await getGoogleDriveClient();
    
    folderId = await findOrCreateNestedFolders(companyName, saleName);

    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: 'image/jpeg',
      body: fs.createReadStream(filePathOrConfig)
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });

    console.log(`✅ Uploaded to Google Drive: ${response.data.name}`);
    console.log(`   Location: Product Images > ${companyName} > ${saleName}`);
    console.log(`   View link: ${response.data.webViewLink}`);

    return {
      fileId: response.data.id,
      fileName: response.data.name,
      webViewLink: response.data.webViewLink
    };

  } catch (error) {
    console.error('❌ Failed to upload to Google Drive:', error.message);
    throw error;
  }
}
