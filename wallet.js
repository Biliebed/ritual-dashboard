// ===== WALLET CONNECT MODULE =====
// Handles wallet connection for MetaMask, Rabby, OKX, and other EVM wallets

const WalletConnect = {
    connected: false,
    data: {
        address: '',
        balance: 0,
        network: 'Ethereum',
        chainId: null
    },
    providers: [],
    currentProvider: null,

    // Initialize and detect available wallets
    async init() {
        await this.detectProviders();
        this.setupListeners();
        console.log('WalletConnect initialized. Detected:', this.providers.map(p => p.name));
    },

    // Detect all available wallet providers
    async detectProviders() {
        this.providers = [];

        // Check window.ethereum (most wallets inject here)
        if (window.ethereum) {
            // Identify which wallet
            if (window.ethereum.isMetaMask && !window.ethereum.isRabby) {
                this.providers.push({ name: 'MetaMask', provider: window.ethereum, type: 'metamask', icon: '🦊' });
            }
            if (window.ethereum.isRabby || window.ethereum.isRabbyWallet) {
                this.providers.push({ name: 'Rabby', provider: window.ethereum, type: 'rabby', icon: '🐰' });
            }
            if (window.ethereum.isOKXWallet || window.okxwallet) {
                const provider = window.okxwallet?.ethereum || window.ethereum;
                this.providers.push({ name: 'OKX Wallet', provider: provider, type: 'okx', icon: '⬛' });
            }
            if (window.ethereum.isCoinbaseWallet) {
                this.providers.push({ name: 'Coinbase', provider: window.ethereum, type: 'coinbase', icon: '🔵' });
            }
            
            // Generic fallback if no specific wallet identified
            if (this.providers.length === 0) {
                this.providers.push({ name: 'Browser Wallet', provider: window.ethereum, type: 'metamask', icon: '🦊' });
            }
        }

        // Check Rabby specific window
        if (window.rabby?.ethereum && !this.providers.find(p => p.type === 'rabby')) {
            this.providers.push({ name: 'Rabby', provider: window.rabby.ethereum, type: 'rabby', icon: '🐰' });
        }

        // Check OKX specific window  
        if (window.okxwallet?.ethereum && !this.providers.find(p => p.type === 'okx')) {
            this.providers.push({ name: 'OKX Wallet', provider: window.okxwallet.ethereum, type: 'okx', icon: '⬛' });
        }

        return this.providers;
    },

    // Get provider for specific wallet type
    getProvider(type) {
        // First try to find exact match
        let found = this.providers.find(p => p.type === type);
        if (found) return found.provider;

        // Fallback: use any available provider
        if (this.providers.length > 0) {
            return this.providers[0].provider;
        }

        // Last resort: check window.ethereum directly
        if (window.ethereum) {
            return window.ethereum;
        }

        return null;
    },

    // Check if wallet is available
    isWalletAvailable(type) {
        return this.providers.some(p => p.type === type) || !!window.ethereum;
    },

    // Connect to wallet
    async connect(type) {
        const provider = this.getProvider(type);
        
        if (!provider) {
            this.showInstallPrompt(type);
            return { success: false, error: 'No wallet detected' };
        }

        try {
            // Show connecting toast
            showToast('🔗 Connecting to wallet...');

            // Request accounts
            const accounts = await provider.request({ 
                method: 'eth_requestAccounts' 
            });

            if (!accounts || accounts.length === 0) {
                showToast('❌ No accounts found. Please unlock your wallet.');
                return { success: false, error: 'No accounts' };
            }

            const address = accounts[0];

            // Get balance
            let balanceEth = '0.0000';
            try {
                const balanceHex = await provider.request({
                    method: 'eth_getBalance',
                    params: [address, 'latest']
                });
                balanceEth = (parseInt(balanceHex, 16) / 1e18).toFixed(4);
            } catch (e) {
                console.warn('Could not fetch balance:', e);
            }

            // Get chain ID
            let chainId = '0x1';
            try {
                chainId = await provider.request({ method: 'eth_chainId' });
            } catch (e) {
                console.warn('Could not fetch chain ID:', e);
            }

            // Store data
            this.data = {
                address,
                balance: balanceEth,
                network: this.getNetworkName(chainId),
                chainId
            };
            
            this.connected = true;
            this.currentProvider = provider;

            // Update UI
            this.updateUI(type);

            const walletName = this.getWalletName(type);
            showToast(`✅ Connected to ${walletName}!`);
            addNotification('success', '🔗', `Wallet connected: ${address.slice(0, 6)}...${address.slice(-4)}`);

            return { success: true, ...this.data };

        } catch (error) {
            console.error('Wallet connection error:', error);
            
            if (error.code === 4001) {
                showToast('❌ Connection rejected by user');
            } else if (error.code === -32002) {
                showToast('⚠️ Connection request pending. Please check your wallet.');
            } else {
                showToast('❌ Failed to connect: ' + (error.message || 'Unknown error'));
            }
            
            return { success: false, error: error.message };
        }
    },

    // Disconnect wallet
    disconnect() {
        this.connected = false;
        this.data = { address: '', balance: 0, network: 'Ethereum', chainId: null };
        this.currentProvider = null;

        // Update UI
        const walletBtn = document.getElementById('walletBtn');
        const walletBtnText = document.getElementById('walletBtnText');
        if (walletBtn) walletBtn.classList.remove('connected');
        if (walletBtnText) walletBtnText.textContent = 'Connect Wallet';

        showWalletConnectView();
        closeWalletModal();

        showToast('🔌 Wallet disconnected');
        addNotification('info', '🔌', 'Wallet disconnected');
    },

    // Update UI with wallet data
    updateUI(type) {
        const { address, balance, network } = this.data;
        const walletName = this.getWalletName(type);

        // Update button
        const walletBtn = document.getElementById('walletBtn');
        const walletBtnText = document.getElementById('walletBtnText');
        if (walletBtn) walletBtn.classList.add('connected');
        if (walletBtnText) walletBtnText.textContent = address.slice(0, 6) + '...' + address.slice(-4);

        // Update modal
        const walletAddress = document.getElementById('walletAddress');
        const walletBalance = document.getElementById('walletBalance');
        const walletNameEl = document.getElementById('walletName');
        
        if (walletAddress) walletAddress.textContent = address;
        if (walletBalance) walletBalance.innerHTML = balance + ' <span>ETH</span>';
        if (walletNameEl) walletNameEl.textContent = walletName;

        // Update stats
        const balanceUsd = (parseFloat(balance) * 3500).toFixed(0);
        const statValues = document.querySelectorAll('.wallet-stat-value');
        if (statValues[0]) statValues[0].textContent = '$' + balanceUsd.toLocaleString();
        if (statValues[2]) statValues[2].textContent = network;

        showWalletConnectedView();
    },

    // Show install prompt
    showInstallPrompt(type) {
        const installUrls = {
            metamask: 'https://metamask.io/download/',
            rabby: 'https://rabby.io/',
            okx: 'https://www.okx.com/web3',
            coinbase: 'https://www.coinbase.com/wallet',
            phantom: 'https://phantom.app/'
        };

        const walletName = this.getWalletName(type);
        
        if (installUrls[type]) {
            if (confirm(`${walletName} not detected. Would you like to install it?`)) {
                window.open(installUrls[type], '_blank');
            }
        } else {
            showToast('⚠️ Please install MetaMask, Rabby, or OKX Wallet.');
        }
    },

    // Get wallet display name
    getWalletName(type) {
        const names = {
            metamask: 'MetaMask',
            rabby: 'Rabby Wallet',
            okx: 'OKX Wallet',
            walletconnect: 'WalletConnect',
            coinbase: 'Coinbase Wallet',
            phantom: 'Phantom'
        };
        return names[type] || 'Wallet';
    },

    // Get network name from chain ID
    getNetworkName(chainId) {
        const networks = {
            '0x1': 'Ethereum',
            '0x89': 'Polygon',
            '0xa': 'Optimism',
            '0xa4b1': 'Arbitrum',
            '0x2105': 'Base',
            '0xaa36a7': 'Sepolia',
            '0x539': 'Hardhat',
            '0x7a69': 'Localhost',
            '0x7c7': 'Ritual Testnet'
        };
        return networks[chainId] || `Chain ${parseInt(chainId, 16)}`;
    },

    // Setup event listeners
    setupListeners() {
        const provider = window.ethereum || this.currentProvider;
        if (!provider) return;

        provider.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                this.disconnect();
            } else if (this.connected) {
                this.data.address = accounts[0];
                this.updateUI(this.data.type || 'metamask');
                showToast('🔄 Account changed');
            }
        });

        provider.on('chainChanged', (chainId) => {
            window.location.reload();
        });

        provider.on('disconnect', () => {
            this.disconnect();
        });
    }
};

// Helper functions for UI
function showWalletConnectView() {
    const connectView = document.getElementById('walletConnectView');
    const connectedView = document.getElementById('walletConnectedView');
    const disconnectBtn = document.getElementById('walletDisconnectBtn');
    
    if (connectView) connectView.style.display = 'block';
    if (connectedView) connectedView.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
}

function showWalletConnectedView() {
    const connectView = document.getElementById('walletConnectView');
    const connectedView = document.getElementById('walletConnectedView');
    const disconnectBtn = document.getElementById('walletDisconnectBtn');
    
    if (connectView) connectView.style.display = 'none';
    if (connectedView) connectedView.style.display = 'block';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
}

function openWalletModal() {
    if (WalletConnect.connected) {
        showWalletConnectedView();
    } else {
        showWalletConnectView();
    }
    document.getElementById('walletModal').classList.add('active');
}

function closeWalletModal() {
    document.getElementById('walletModal').classList.remove('active');
}

async function connectWallet(type) {
    await WalletConnect.connect(type);
}

function disconnectWallet() {
    WalletConnect.disconnect();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    WalletConnect.init();
});
