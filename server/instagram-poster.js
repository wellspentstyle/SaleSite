import fetch from 'node-fetch';

const LATE_API_KEY = process.env.LATE_API_KEY;
const INSTAGRAM_ACCOUNT_ID = process.env.LATE_INSTAGRAM_ACCOUNT_ID;

const LATE_API_BASE = 'https://getlate.dev/api/v1';

export async function postToInstagram({ imageUrl, caption, isStory = false }) {
  if (!LATE_API_KEY) {
    throw new Error('LATE_API_KEY is not configured');
  }
  
  if (!INSTAGRAM_ACCOUNT_ID) {
    throw new Error('LATE_INSTAGRAM_ACCOUNT_ID is not configured');
  }

  console.log(`📸 Posting to Instagram${isStory ? ' Story' : ''}...`);
  console.log(`   Image URL: ${imageUrl.substring(0, 80)}...`);
  console.log(`   Caption: ${caption ? caption.substring(0, 50) + '...' : '(no caption)'}`);

  const payload = {
    platforms: [{
      platform: 'instagram',
      accountId: INSTAGRAM_ACCOUNT_ID,
      ...(isStory ? { platformSpecificData: { contentType: 'story' } } : {})
    }],
    mediaItems: [{
      type: 'image',
      url: imageUrl
    }],
    content: caption || ' ',
    publishNow: true
  };

  try {
    const response = await fetch(`${LATE_API_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('   ❌ Late.dev API error:', result);
      throw new Error(result.message || result.error || 'Failed to post to Instagram');
    }

    console.log(`   ✅ Posted successfully! Post ID: ${result.id || 'unknown'}`);
    
    return {
      success: true,
      postId: result.id,
      result
    };

  } catch (error) {
    console.error(`   ❌ Failed to post to Instagram: ${error.message}`);
    throw error;
  }
}

export async function postCarouselToInstagram({ imageUrls, caption }) {
  if (!LATE_API_KEY) {
    throw new Error('LATE_API_KEY is not configured');
  }
  
  if (!INSTAGRAM_ACCOUNT_ID) {
    throw new Error('LATE_INSTAGRAM_ACCOUNT_ID is not configured');
  }

  if (!imageUrls || imageUrls.length < 2) {
    throw new Error('Carousel requires at least 2 images');
  }

  console.log(`📸 Posting carousel to Instagram (${imageUrls.length} images)...`);

  const payload = {
    platforms: [{
      platform: 'instagram',
      accountId: INSTAGRAM_ACCOUNT_ID
    }],
    mediaItems: imageUrls.map(url => ({
      type: 'image',
      url
    })),
    content: caption || '',
    publishNow: true
  };

  try {
    const response = await fetch(`${LATE_API_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('   ❌ Late.dev API error:', result);
      throw new Error(result.message || result.error || 'Failed to post carousel');
    }

    console.log(`   ✅ Carousel posted successfully! Post ID: ${result.id || 'unknown'}`);
    
    return {
      success: true,
      postId: result.id,
      result
    };

  } catch (error) {
    console.error(`   ❌ Failed to post carousel: ${error.message}`);
    throw error;
  }
}

export async function scheduleInstagramPost({ imageUrl, caption, scheduledFor, isStory = false }) {
  if (!LATE_API_KEY) {
    throw new Error('LATE_API_KEY is not configured');
  }
  
  if (!INSTAGRAM_ACCOUNT_ID) {
    throw new Error('LATE_INSTAGRAM_ACCOUNT_ID is not configured');
  }

  console.log(`📅 Scheduling Instagram post for ${scheduledFor}...`);

  const payload = {
    platforms: [{
      platform: 'instagram',
      accountId: INSTAGRAM_ACCOUNT_ID,
      ...(isStory ? { platformSpecificData: { contentType: 'story' } } : {})
    }],
    mediaItems: [{
      type: 'image',
      url: imageUrl
    }],
    content: caption || ' ',
    scheduledFor: scheduledFor
  };

  try {
    const response = await fetch(`${LATE_API_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('   ❌ Late.dev API error:', result);
      throw new Error(result.message || result.error || 'Failed to schedule post');
    }

    console.log(`   ✅ Post scheduled! Post ID: ${result.id || 'unknown'}`);
    
    return {
      success: true,
      postId: result.id,
      scheduledFor,
      result
    };

  } catch (error) {
    console.error(`   ❌ Failed to schedule post: ${error.message}`);
    throw error;
  }
}

export async function getConnectedAccounts() {
  if (!LATE_API_KEY) {
    throw new Error('LATE_API_KEY is not configured');
  }

  try {
    const response = await fetch(`${LATE_API_BASE}/accounts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${LATE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to get accounts');
    }

    return result;

  } catch (error) {
    console.error(`Failed to get connected accounts: ${error.message}`);
    throw error;
  }
}

export async function testConnection() {
  console.log('🔌 Testing Late.dev connection...');
  
  try {
    const accounts = await getConnectedAccounts();
    
    const instagramAccount = accounts.find(a => 
      a.platform === 'instagram' && a.id === INSTAGRAM_ACCOUNT_ID
    );
    
    if (instagramAccount) {
      console.log(`   ✅ Connected to Instagram: @${instagramAccount.username || instagramAccount.name}`);
      return { success: true, account: instagramAccount };
    } else {
      console.log(`   ⚠️  Instagram account ${INSTAGRAM_ACCOUNT_ID} not found`);
      console.log(`   Available accounts:`, accounts.map(a => `${a.platform}: ${a.id}`).join(', '));
      return { success: false, accounts };
    }
  } catch (error) {
    console.error(`   ❌ Connection test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}
