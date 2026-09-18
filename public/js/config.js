// public/js/config.js
const API_CONFIG = {
    // URLs
    getApiUrl: function() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // Produção - mesmo domínio
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            return `${protocol}//${hostname}/api`;
        }
        
        // Desenvolvimento
        return 'http://localhost:3000/api';
    },
    
    // Outras configurações
    getUploadsUrl: function() {
        return `${this.getApiUrl().replace('/api', '')}/uploads`;
    }
};

// URL global da API
const API_URL = API_CONFIG.getApiUrl();
const UPLOADS_URL = API_CONFIG.getUploadsUrl();

console.log('🔧 Ambiente:', window.location.hostname === 'localhost' ? 'Desenvolvimento' : 'Produção');
console.log(' API URL:', API_URL);