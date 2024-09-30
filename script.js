// Initialize variables
let posts = [];
let playlists = [];
let likedPosts = [];
let isEditorMode = false;

// Initialize the text editor
var quill = new Quill('#editor', {
    theme: 'snow',
    modules: {
        toolbar: [
            [{ 'header': '1'}, {'header': '2'}, { 'font': [] }],
            [{size: []}],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{'list': 'ordered'}, {'list': 'bullet'},
             {'indent': '-1'}, {'indent': '+1'}],
            ['link', 'image', 'video'],
            ['clean']
        ]
    }
});

// Function to save media to Firebase Storage
async function saveMediaToFirebase(file) {
    const storageRef = storage.ref();
    const fileRef = storageRef.child(`media/${Date.now()}_${file.name}`);
    await fileRef.put(file);
    return await fileRef.getDownloadURL();
}

// Function to create a new post
async function createPost(content, mediaFile) {
    const timestamp = new Date().toLocaleString();
    let mediaUrl = null;
    let mediaType = null;

    if (mediaFile) {
        mediaUrl = await saveMediaToFirebase(mediaFile);
        mediaType = mediaFile.type;
    }

    const newPost = {
        content: content,
        timestamp: timestamp,
        mediaUrl: mediaUrl,
        mediaType: mediaType
    };

    const docRef = await db.collection('posts').add(newPost);
    newPost.id = docRef.id;
    posts.unshift(newPost);
    return newPost;
}

// Function to load posts from Firestore
async function loadPosts() {
    const snapshot = await db.collection('posts').orderBy('timestamp', 'desc').get();
    posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    displayPosts(posts);
}

// Function to handle post button click
async function handlePostButtonClick() {
    const content = quill.root.innerHTML;
    const videoFile = document.querySelector('#videoUpload').files[0];
    const imageFile = document.querySelector('#imageUpload').files[0];
    const mediaFile = videoFile || imageFile;

    if (content.trim() !== '' || mediaFile) {
        await createPost(content, mediaFile);
        displayPosts(posts);
        quill.setText('');
        document.querySelector('#videoUpload').value = '';
        document.querySelector('#imageUpload').value = '';
    }
}

// Function to handle heart button click
async function handleHeartButtonClick(event) {
    if (event.target.classList.contains('heart-button') || event.target.parentElement.classList.contains('heart-button')) {
        const heartButton = event.target.classList.contains('heart-button') ? event.target : event.target.parentElement;
        const postId = heartButton.getAttribute('data-post-id');
        
        heartButton.classList.toggle('liked');
        
        if (heartButton.classList.contains('liked')) {
            heartButton.innerHTML = '<i class="fas fa-heart"></i>';
            await db.collection('likedPosts').add({ postId: postId });
        } else {
            heartButton.innerHTML = '<i class="far fa-heart"></i>';
            const likedPostQuery = await db.collection('likedPosts').where('postId', '==', postId).get();
            likedPostQuery.forEach(async (doc) => {
                await doc.ref.delete();
            });
        }
        
        await updateLikedPosts();
    }
}

// Function to update liked posts in the menu
async function updateLikedPosts() {
    const likedPostsSnapshot = await db.collection('likedPosts').get();
    const likedPostsCount = likedPostsSnapshot.size;
    const likedPostsLink = document.querySelector('#likedPostsLink');
    likedPostsLink.innerHTML = `<i class="fas fa-heart"></i>Liked Posts (${likedPostsCount})`;
}

// Function to handle delete button click
async function handleDeleteButtonClick(event) {
    if (event.target.classList.contains('delete-button')) {
        const post = event.target.closest('.post');
        const postId = post.querySelector('.heart-button').getAttribute('data-post-id');
        
        await db.collection('posts').doc(postId).delete();
        const likedPostQuery = await db.collection('likedPosts').where('postId', '==', postId).get();
        likedPostQuery.forEach(async (doc) => {
            await doc.ref.delete();
        });
        
        await loadPosts();
        await updateLikedPosts();
    }
}

// Function to handle search input
function handleSearchInput(event) {
    const searchTerm = event.target.value.toLowerCase();
    const filteredPosts = posts.filter(post => 
        post.content.toLowerCase().includes(searchTerm)
    );
    
    displayPosts(filteredPosts);
}

// Function to display posts
function displayPosts(postsToDisplay, isPlaylist = false) {
    const postContainer = document.querySelector('#postContainer');
    postContainer.innerHTML = '';

    if (isPlaylist) {
        if (postsToDisplay.length === 0) {
            postContainer.innerHTML = '<p>No playlists created</p>';
            return;
        }
        postsToDisplay.forEach(playlist => {
            const playlistElement = document.createElement('div');
            playlistElement.className = 'playlist-square';
            playlistElement.innerHTML = `
                <h3>${playlist.name}</h3>
                <p>${playlist.posts.length} posts</p>
            `;
            playlistElement.addEventListener('click', () => displayPlaylistPosts(playlist.id));
            postContainer.appendChild(playlistElement);
        });
    } else {
        postsToDisplay.forEach(post => {
            const postElement = document.createElement('div');
            postElement.className = 'post';
            let mediaHTML = '';
            if (post.mediaUrl) {
                if (post.mediaType.startsWith('image')) {
                    mediaHTML = `<img src="${post.mediaUrl}" alt="Post image">`;
                } else if (post.mediaType.startsWith('video')) {
                    mediaHTML = `<video src="${post.mediaUrl}" controls></video>`;
                }
            }
            postElement.innerHTML = `
                <div class="post-content">${post.content}${mediaHTML}</div>
                <div class="timestamp">${post.timestamp}</div>
                <button class="heart-button" data-post-id="${post.id}">
                    <i class="far fa-heart"></i>
                </button>
                ${isEditorMode ? '<button class="delete-button">Delete</button>' : ''}
            `;
            postContainer.appendChild(postElement);
        });
    }
}

// Function to open create playlist modal
function openCreatePlaylistModal() {
    const modal = document.getElementById('createPlaylistModal');
    modal.style.display = 'block';
    
    const playlistPostList = document.getElementById('playlistPostList');
    playlistPostList.innerHTML = '';
    
    posts.forEach(post => {
        const postElement = document.createElement('div');
        postElement.innerHTML = `
            <input type="checkbox" id="post-${post.id}" value="${post.id}">
            <label for="post-${post.id}">${post.content.substring(0, 50)}...</label>
        `;
        playlistPostList.appendChild(postElement);
    });
}

// Function to close create playlist modal
function closeCreatePlaylistModal() {
    const modal = document.getElementById('createPlaylistModal');
    modal.style.display = 'none';
}

// Function to save playlist
async function savePlaylist() {
    const playlistName = document.getElementById('playlistNameInput').value;
    if (playlistName.trim() === '') {
        alert('Please enter a playlist name');
        return;
    }
    
    const selectedPosts = Array.from(document.querySelectorAll('#playlistPostList input:checked'))
        .map(input => input.value);
    
    if (selectedPosts.length === 0) {
        alert('Please select at least one post for the playlist');
        return;
    }
    
    const newPlaylist = {
        name: playlistName,
        posts: selectedPosts
    };
    
    await db.collection('playlists').add(newPlaylist);
    await loadPlaylists();
    updatePlaylistMenu();
    closeCreatePlaylistModal();
}

// Function to Delete Playlist
async function deletePlaylist(playlistId) {
    await db.collection('playlists').doc(playlistId).delete();
    await loadPlaylists();
    updatePlaylistMenu();
    displayPosts(posts); // Return to showing all posts
}

// Function to load playlists from Firestore
async function loadPlaylists() {
    const snapshot = await db.collection('playlists').get();
    playlists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Function to update playlist menu
function updatePlaylistMenu() {
    const playlistMenu = document.querySelector('.user-collection nav ul');
    const createPlaylistLink = document.querySelector('#createPlaylistLink');
    
    // Remove existing playlist links
    Array.from(playlistMenu.children).forEach(child => {
        if (!child.querySelector('#createPlaylistLink') && !child.querySelector('#likedPostsLink')) {
            child.remove();
        }
    });
    
    // Add new playlist links
    playlists.forEach(playlist => {
        const playlistLink = document.createElement('li');
        playlistLink.innerHTML = `
            <a href="#" data-playlist-id="${playlist.id}">
                <i class="fas fa-list"></i>${playlist.name}
            </a>
            <button class="delete-playlist-button" data-playlist-id="${playlist.id}">
                <i class="fas fa-trash"></i>
            </button>
        `;
        playlistMenu.insertBefore(playlistLink, createPlaylistLink.parentElement.nextSibling);
    });
}

// Function for playlist back button
async function displayPlaylistPosts(playlistId) {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;

    const postContainer = document.querySelector('#postContainer');
    postContainer.innerHTML = `
        <button id="backToPlaylists" class="back-button">
            <i class="fas fa-arrow-left"></i> Back to Playlists
        </button>
        <h2>${playlist.name}</h2>
    `;

    document.getElementById('backToPlaylists').addEventListener('click', () => displayPosts(playlists, true));

    const playlistPosts = posts.filter(post => playlist.posts.includes(post.id));
    displayPosts(playlistPosts);
}

// Function to toggle settings menu
function toggleSettingsMenu() {
    const settingsMenu = document.getElementById('settingsMenu');
    settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'block' : 'none';
}

// Function to switch to user mode
function switchToUserMode() {
    isEditorMode = false;
    document.querySelectorAll('.editor-only').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.delete-button').forEach(el => el.style.display = 'none');
    document.querySelector('.text-editor').style.display = 'none';
}

// Function to switch to editor mode
function switchToEditorMode() {
    isEditorMode = true;
    document.querySelectorAll('.editor-only').forEach(el => el.style.display = 'block');
    document.querySelectorAll('.delete-button').forEach(el => el.style.display = 'inline-block');
    document.querySelector('.text-editor').style.display = 'block';
}

// Function to open passcode modal
function openPasscodeModal() {
    document.getElementById('passcodeModal').style.display = 'block';
}

// Function to close passcode modal
function closePasscodeModal() {
    document.getElementById('passcodeModal').style.display = 'none';
    document.getElementById('passcodeInput').value = '';
}

// Function to handle passcode submission
function handlePasscodeSubmission() {
    const passcode = document.getElementById('passcodeInput').value;
    if (passcode === '1010') {
        switchToEditorMode();
        closePasscodeModal();
    } else {
        alert('Incorrect passcode. Please try again.');
    }
}

// Function to hide settings menu when clicking outside
function hideSettingsMenu(event) {
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsToggle = document.getElementById('settingsToggle');
    if (!settingsMenu.contains(event.target) && !settingsToggle.contains(event.target)) {
        settingsMenu.style.display = 'none';
    }
}

// Function to hide search bar
function hideSearchBar() {
    document.querySelector('#searchContainer').style.display = 'none';
    document.querySelector('#searchInput').value = ''; // Clear search input
    displayPosts(posts); // Reset to display all posts
}

function enlargeImage(img) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1000';

    const enlargedImg = document.createElement('img');
    enlargedImg.src = img.src;
    enlargedImg.style.maxWidth = '90%';
    enlargedImg.style.maxHeight = '90%';
    enlargedImg.style.objectFit = 'contain';

    modal.appendChild(enlargedImg);
    document.body.appendChild(modal);

    modal.onclick = function() {
        document.body.removeChild(modal);
    };
}

// Event listeners
document.addEventListener('click', hideSettingsMenu);
document.querySelector('#postButton').addEventListener('click', handlePostButtonClick);
document.querySelector('#postContainer').addEventListener('click', handleHeartButtonClick);
document.querySelector('#postContainer').addEventListener('click', handleDeleteButtonClick);
document.querySelector('#searchInput').addEventListener('input', handleSearchInput);
document.querySelector('#createPlaylistLink').addEventListener('click', openCreatePlaylistModal);
document.querySelector('.close').addEventListener('click', closeCreatePlaylistModal);
document.querySelector('#savePlaylistButton').addEventListener('click', savePlaylist);
document.querySelector('.user-collection').addEventListener('click', (event) => {
    if (event.target.closest('a') && event.target.closest('a').getAttribute('data-playlist-id')) {
        const playlistId = event.target.closest('a').getAttribute('data-playlist-id');
        displayPlaylistPosts(playlistId);
    }
});
document.querySelector('#settingsToggle').addEventListener('click', toggleSettingsMenu);
document.querySelector('#likedPostsLink').addEventListener('click', async () => {
    const likedPostsSnapshot = await db.collection('likedPosts').get();
    const likedPostIds = likedPostsSnapshot.docs.map(doc => doc.data().postId);
    const likedPosts = posts.filter(post => likedPostIds.includes(post.id));
    displayPosts(likedPosts);
    hideSearchBar();
});
document.querySelector('#homeLink').addEventListener('click', () => {
    displayPosts(posts);
    hideSearchBar();
});
document.querySelector('#searchLink').addEventListener('click', () => {
    document.querySelector('#searchContainer').style.display = 'block';
});
document.querySelector('#closeSearch').addEventListener('click', hideSearchBar);
document.querySelector('#libraryLink').addEventListener('click', () => {
    displayPosts(playlists, true);
    hideSearchBar();
});
document.querySelector('#uploadVideoButton').addEventListener('click', () => {
    document.querySelector('#videoUpload').click();
});
document.querySelector('#videoUpload').addEventListener('change', (event) => {
    if (event.target.files.length > 0) {
        alert('Video selected for upload');
    }
});
document.querySelector('#uploadImageButton').addEventListener('click', () => {
    document.querySelector('#imageUpload').click();
});
document.querySelector('#imageUpload').addEventListener('change', (event) => {
    if (event.target.files.length > 0) {
        alert('Image selected for upload');
    }
});
document.querySelector('.user-collection').addEventListener('click', (event) => {
    if (event.target.closest('.delete-playlist-button')) {
        const playlistId = event.target.closest('.delete-playlist-button').getAttribute('data-playlist-id');
        deletePlaylist(playlistId);
    }
});
document.querySelector('#userModeLink').addEventListener('click', switchToUserMode);
document.querySelector('#editorModeLink').addEventListener('click', openPasscodeModal);
document.querySelector('#submitPasscode').addEventListener('click', handlePasscodeSubmission);
document.querySelector('#cancelPasscode').addEventListener('click', closePasscodeModal);

// Initial setup
document.addEventListener('DOMContentLoaded', async () => {
    await loadPosts();
    await loadPlaylists();
    await updateLikedPosts();
    switchToUserMode(); // Start in user mode
});