/**
 * L&A Royal Advisory - Core Application Logic
 * Sistema Front-end com estado simulado via localStorage.
 */

// ==========================================
// 1. ESTADO GLOBAL E CONFIGURAÇÕES INICIAIS
// ==========================================
const CONFIG = {
    supportPhone: '5581989492224',
    storageKey: 'LA_ROYAL_STATE_V1'
};

const INITIAL_PRODUCTS = [
    {
        id: 'prod_1',
        name: 'Consultoria Individual Premium',
        description: 'Sessão estratégica de alto nível com diagnóstico aprofundado e plano de ação personalizado.',
        price: 3500.00,
        discount: 10,
        stock: 5,
        commission: 15,
        image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=800',
        category: 'Consultoria'
    },
    {
        id: 'prod_2',
        name: 'Mentoria Executiva Mensal',
        description: 'Acompanhamento contínuo individualizado para tomada de decisão e desenvolvimento de liderança.',
        price: 5000.00,
        discount: 0,
        stock: 3,
        commission: 20,
        image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=800',
        category: 'Mentoria'
    },
    {
        id: 'prod_3',
        name: 'Workshop de Liderança Estratégica',
        description: 'Imersão prática para executivos e gestores com foco em alta performance e cultura organizacional.',
        price: 1200.00,
        discount: 15,
        stock: 12,
        commission: 10,
        image: 'https://images.unsplash.com/photo-1515187029135-18ee286d815b?q=80&w=800',
        category: 'Workshops'
    },
    {
        id: 'prod_4',
        name: 'Diagnóstico Empresarial Completo',
        description: 'Mapeamento detalhado de processos, riscos e oportunidades de crescimento corporativo.',
        price: 8500.00,
        discount: 5,
        stock: 2,
        commission: 12,
        image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800',
        category: 'Diagnóstico'
    }
];

let state = {
    currentUser: null,
    products: [],
    cart: [],
    orders: [],
    affiliates: [],
    consultingBookings: [],
    returns: [],
    activeAffiliateCode: null,
    settings: {
        companyName: 'L&A Royal Advisory',
        cnpj: '00.000.000/0001-00',
        contactEmail: 'contacto@laroyal.com.br',
        defaultCommission: 15
    },
    preferences: {
        cookiesAccepted: null,
        accessibility: {
            fontSize: 100,
            highContrast: false
        }
    }
};

// ==========================================
// 2. INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    captureAffiliateRef();
    registerServiceWorker();
    applyAccessibilityPreferences();
    renderCatalog();
    updateCartUI();
    checkCookieConsent();
    initIcons();
});

function initIcons() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function loadState() {
    const saved = localStorage.getItem(CONFIG.storageKey);
    if (saved) {
        try {
            state = { ...state, ...JSON.parse(saved) };
        } catch (e) {
            console.error('Erro ao carregar estado do localStorage', e);
        }
    } else {
        state.products = INITIAL_PRODUCTS;
        saveState();
    }
}

function saveState() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
}

// Captura indicação via ?ref=CODIGO
function captureAffiliateRef() {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
        state.activeAffiliateCode = ref;
        saveState();
    }
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker registado com sucesso.'))
            .catch(err => console.warn('Erro ao registar Service Worker:', err));
    }
}

// ==========================================
// 3. CATALOGO E VITRINE
// ==========================================
function renderCatalog(filteredCategory = 'all') {
    const container = document.getElementById('catalogContainer');
    if (!container) return;

    const productsToRender = filteredCategory === 'all'
        ? state.products
        : state.products.filter(p => p.category.toLowerCase() === filteredCategory.toLowerCase());

    if (productsToRender.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-slate-400 py-8">Nenhum serviço disponível nesta categoria.</p>`;
        return;
    }

    container.innerHTML = productsToRender.map(product => {
        const finalPrice = product.discount > 0 
            ? product.price * (1 - product.discount / 100) 
            : product.price;
        const isOutOfStock = product.stock <= 0;

        return `
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg hover:border-amber-500/40 transition group">
                <div>
                    <div class="relative h-48 overflow-hidden">
                        <img src="${product.image}" alt="${product.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                        <span class="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md text-amber-400 border border-amber-500/20 text-xs px-3 py-1 rounded-full uppercase tracking-wider font-semibold">
                            ${product.category}
                        </span>
                        ${product.discount > 0 ? `
                            <span class="absolute top-3 right-3 bg-amber-500 text-slate-950 text-xs font-bold px-2.5 py-1 rounded-full">
                                -${product.discount}%
                            </span>
                        ` : ''}
                    </div>
                    <div class="p-6">
                        <h4 class="text-xl font-serif font-bold text-white mb-2">${product.name}</h4>
                        <p class="text-sm text-slate-400 line-clamp-2 leading-relaxed mb-4">${product.description}</p>
                        
                        <div class="flex items-center gap-2 mb-2">
                            <i data-lucide="users" class="w-4 h-4 text-amber-500"></i>
                            <span class="text-xs ${isOutOfStock ? 'text-red-400 font-bold' : 'text-slate-400'}">
                                ${isOutOfStock ? 'Vagas Esgotadas' : `${product.stock} vagas disponíveis`}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="p-6 pt-0">
                    <div class="mb-4">
                        ${product.discount > 0 ? `
                            <span class="text-xs text-slate-500 line-through block">R$ ${product.price.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        ` : ''}
                        <span class="text-2xl font-bold text-amber-400">R$ ${finalPrice.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                    </div>
                    
                    <button 
                        type="button" 
                        onclick="addToCart('${product.id}')"
                        ${isOutOfStock ? 'disabled' : ''}
                        class="w-full py-3 rounded-xl font-bold transition flex items-center justify-center gap-2 ${
                            isOutOfStock 
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                            : 'gradient-gold text-slate-950 hover:shadow-gold btn-premium'
                        }"
                    >
                        <i data-lucide="${isOutOfStock ? 'slash' : 'shopping-bag'}" class="w-4 h-4"></i>
                        ${isOutOfStock ? 'Esgotado' : 'Adicionar ao Carrinho'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    initIcons();
}

function filterCatalog(category) {
    renderCatalog(category);
}

// ==========================================
// 4. CARRINHO DE COMPRAS E CHECKOUT
// ==========================================
function addToCart(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product || product.stock <= 0) {
        alert('Serviço sem vagas disponíveis no momento.');
        return;
    }

    const cartItem = state.cart.find(item => item.productId === productId);
    if (cartItem) {
        if (cartItem.quantity >= product.stock) {
            alert(`Limite de vagas atingido (${product.stock} disponíveis).`);
            return;
        }
        cartItem.quantity += 1;
    } else {
        state.cart.push({ productId, quantity: 1 });
    }

    saveState();
    updateCartUI();
    openCartModal();
}

function updateCartQuantity(productId, delta) {
    const cartItem = state.cart.find(item => item.productId === productId);
    const product = state.products.find(p => p.id === productId);
    if (!cartItem || !product) return;

    const newQty = cartItem.quantity + delta;
    if (newQty <= 0) {
        removeFromCart(productId);
        return;
    }

    if (newQty > product.stock) {
        alert(`Apenas ${product.stock} vagas disponíveis.`);
        return;
    }

    cartItem.quantity = newQty;
    saveState();
    updateCartUI();
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(item => item.productId !== productId);
    saveState();
    updateCartUI();
}

function getCartTotals() {
    let subtotal = 0;
    let totalDiscount = 0;

    state.cart.forEach(item => {
        const product = state.products.find(p => p.id === item.productId);
        if (product) {
            const itemOriginal = product.price * item.quantity;
            const itemDiscount = (product.price * (product.discount / 100)) * item.quantity;
            subtotal += itemOriginal;
            totalDiscount += itemDiscount;
        }
    });

    return {
        subtotal,
        discount: totalDiscount,
        total: subtotal - totalDiscount,
        itemCount: state.cart.reduce((acc, item) => acc + item.quantity, 0)
    };
}

function updateCartUI() {
    const totals = getCartTotals();
    
    // Atualiza contadores visuais
    const badge = document.getElementById('cartBadge');
    if (badge) {
        badge.innerText = totals.itemCount;
        badge.classList.toggle('hidden', totals.itemCount === 0);
    }

    const container = document.getElementById('cartItemsContainer');
    const totalElement = document.getElementById('cartTotalValue');
    if (totalElement) totalElement.innerText = `R$ ${totals.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    if (!container) return;

    if (state.cart.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-400 py-8">Seu carrinho está vazio.</p>`;
        return;
    }

    container.innerHTML = state.cart.map(item => {
        const product = state.products.find(p => p.id === item.productId);
        if (!product) return '';
        const unitPrice = product.price * (1 - product.discount / 100);

        return `
            <div class="flex items-center justify-between gap-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                <div class="flex-1">
                    <h5 class="text-sm font-bold text-white">${product.name}</h5>
                    <p class="text-xs text-amber-400 font-semibold">R$ ${unitPrice.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="updateCartQuantity('${product.id}', -1)" class="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center">-</button>
                    <span class="text-sm font-bold text-white px-1">${item.quantity}</span>
                    <button type="button" onclick="updateCartQuantity('${product.id}', 1)" class="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center">+</button>
                </div>
                <button type="button" onclick="removeFromCart('${product.id}')" class="text-slate-400 hover:text-red-400 transition p-1">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `;
    }).join('');

    initIcons();
}

function processCheckout(event) {
    event.preventDefault();
    if (state.cart.length === 0) {
        alert('Seu carrinho está vazio.');
        return;
    }

    const form = event.target;
    const formData = new FormData(form);

    const totals = getCartTotals();
    
    // Criação do objeto de Pedido
    const newOrder = {
        id: 'ORD-' + Date.now().toString().slice(-6),
        date: new Date().toISOString(),
        customer: {
            name: formData.get('name'),
            cpf: formData.get('cpf'),
            phone: formData.get('phone'),
            email: formData.get('email'),
            address: {
                cep: formData.get('cep'),
                street: formData.get('street'),
                number: formData.get('number'),
                city: formData.get('city'),
                state: formData.get('state')
            }
        },
        items: state.cart.map(item => {
            const p = state.products.find(prod => prod.id === item.productId);
            return {
                productId: item.productId,
                name: p.name,
                price: p.price * (1 - p.discount / 100),
                quantity: item.quantity,
                commission: p.commission
            };
        }),
        total: totals.total,
        status: 'pending', // Status inicial
        affiliateCode: state.activeAffiliateCode || null,
        tracking: {
            code: null,
            carrier: null
        }
    };

    // Baixa do estoque/vagas
    state.cart.forEach(item => {
        const product = state.products.find(p => p.id === item.productId);
        if (product) {
            product.stock = Math.max(0, product.stock - item.quantity);
        }
    });

    state.orders.unshift(newOrder);
    state.cart = []; // Limpa o carrinho
    saveState();

    updateCartUI();
    renderCatalog();
    closeCheckoutModal();
    
    alert(`Pedido #${newOrder.id} realizado com sucesso! Status: Pendente de Pagamento.`);
    openCustomerArea();
}

// ==========================================
// 5. ÁREA DO CLIENTE & AGENDAMENTOS
// ==========================================
function openCustomerArea() {
    if (!state.currentUser) {
        openAuthModal();
        return;
    }
    
    renderCustomerOrders();
    // Exibir modal ou elemento de container do perfil do cliente
    const modal = document.getElementById('customerAreaModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function renderCustomerOrders() {
    const container = document.getElementById('customerOrdersContainer');
    if (!container || !state.currentUser) return;

    const userOrders = state.orders.filter(o => o.customer.email === state.currentUser.email || o.customer.cpf === state.currentUser.cpf);

    if (userOrders.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-center py-6">Nenhum pedido encontrado.</p>`;
        return;
    }

    const statusLabels = {
        pending: { text: 'Pendente', class: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
        paid: { text: 'Pago', class: 'bg-green-500/10 text-green-400 border-green-500/20' },
        shipped: { text: 'Enviado', class: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
        delivered: { text: 'Entregue', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
        canceled: { text: 'Cancelado', class: 'bg-red-500/10 text-red-400 border-red-500/20' }
    };

    container.innerHTML = userOrders.map(order => {
        const st = statusLabels[order.status] || statusLabels.pending;
        return `
            <div class="bg-slate-800/60 rounded-xl p-4 border border-slate-700 mb-4">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <span class="font-mono text-xs text-amber-400 font-bold">#${order.id}</span>
                        <p class="text-xs text-slate-400">${new Date(order.date).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-full border ${st.class} font-semibold">
                        ${st.text}
                    </span>
                </div>
                <div class="space-y-1 mb-3">
                    ${order.items.map(i => `<p class="text-sm text-slate-200">${i.quantity}x${i.name}</p>`).join('')}
                </div>
                <div class="flex justify-between items-center pt-2 border-t border-slate-700 text-xs">
                    <span class="text-slate-400">Total: <strong class="text-white">R$ ${order.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong></span>
                    ${order.tracking.code ? `
                        <span class="text-amber-400">Rastreio: ${order.tracking.code} (${order.tracking.carrier})</span>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function submitConsultingBooking(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const booking = {
        id: 'BOOK-' + Date.now().toString().slice(-4),
        company: formData.get('company'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        date: formData.get('date'),
        time: formData.get('time'),
        type: formData.get('type'),
        notes: formData.get('notes'),
        createdAt: new Date().toISOString()
    };

    state.consultingBookings.push(booking);
    saveState();

    alert('Solicitação de agendamento enviada! A equipe entrará em contacto em breve.');
    form.reset();
    closeConsultingBookingModal();
}

// Integrador de Busca de CEP
async function lookupZipCode(cepValue, prefix = '') {
    const cleanCep = cepValue.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();

        if (!data.erro) {
            const streetInput = document.getElementById(`${prefix}street`);
            const cityInput = document.getElementById(`${prefix}city`);
            const stateInput = document.getElementById(`${prefix}state`);

            if (streetInput) streetInput.value = data.logradouro;
            if (cityInput) cityInput.value = data.localidade;
            if (stateInput) stateInput.value = data.uf;
        }
    } catch (e) {
        console.warn('Erro ao consultar CEP:', e);
    }
}

// ==========================================
// 6. SISTEMA DE AFILIADOS
// ==========================================
function registerAffiliate(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const affiliate = {
        id: 'AFF-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        cpf: formData.get('cpf'),
        pixKey: formData.get('pixKey'),
        instagram: formData.get('instagram'),
        status: 'pending', // pending, active, blocked
        createdAt: new Date().toISOString()
    };

    state.affiliates.push(affiliate);
    saveState();

    alert('Solicitação de afiliação enviada com sucesso! Aguarde a aprovação do administrador.');
    form.reset();
}

function getAffiliateMetrics(affiliateCode) {
    const affiliateOrders = state.orders.filter(o => o.affiliateCode === affiliateCode && o.status === 'paid');
    
    let totalCommissions = 0;
    affiliateOrders.forEach(order => {
        order.items.forEach(item => {
            totalCommissions += (item.price * item.quantity) * ((item.commission || 15) / 100);
        });
    });

    return {
        totalSales: affiliateOrders.length,
        totalCommissions
    };
}

// ==========================================
// 7. PAINEL ADMINISTRATIVO
// ==========================================
function renderAdminDashboard() {
    // Atualização de Métricas
    const totalUsers = document.getElementById('adminTotalUsers');
    const totalProducts = document.getElementById('adminTotalProducts');
    const totalOrders = document.getElementById('adminTotalOrders');
    const totalAffiliates = document.getElementById('adminTotalAffiliates');

    if (totalUsers) totalUsers.innerText = state.orders.length + state.affiliates.length; // Estimativa
    if (totalProducts) totalProducts.innerText = state.products.length;
    if (totalOrders) totalOrders.innerText = state.orders.length;
    if (totalAffiliates) totalAffiliates.innerText = state.affiliates.filter(a => a.status === 'active').length;

    renderAdminOrdersTable();
    renderAdminProductsTable();
}

function renderAdminOrdersTable() {
    const tableBody = document.getElementById('adminOrdersTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = state.orders.map(order => `
        <tr class="border-b border-slate-800 text-sm">
            <td class="py-3 px-4 font-mono text-amber-400">#${order.id}</td>
            <td class="py-3 px-4 text-white">${order.customer.name}</td>
            <td class="py-3 px-4 text-slate-300">R$ ${order.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td class="py-3 px-4">
                <select onchange="updateOrderStatus('${order.id}', this.value)" class="bg-slate-800 text-xs border border-slate-700 rounded p-1 text-white">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pendente</option>
                    <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>Pago</option>
                    <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Enviado</option>
                    <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Entregue</option>
                    <option value="canceled" ${order.status === 'canceled' ? 'selected' : ''}>Cancelado</option>
                </select>
            </td>
            <td class="py-3 px-4">
                <button type="button" onclick="promptTracking('${order.id}')" class="text-xs text-amber-400 hover:underline">
                    ${order.tracking.code ? 'Editar Rastreio' : '+ Adicionar Rastreio'}
                </button>
            </td>
        </tr>
    `).join('');
}

function updateOrderStatus(orderId, newStatus) {
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
        order.status = newStatus;
        saveState();
        renderAdminDashboard();
    }
}

function promptTracking(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const code = prompt('Código de rastreamento:', order.tracking.code || '');
    const carrier = prompt('Transportadora:', order.tracking.carrier || '');

    if (code !== null && carrier !== null) {
        order.tracking = { code, carrier };
        saveState();
        renderAdminOrdersTable();
    }
}

function renderAdminProductsTable() {
    const tableBody = document.getElementById('adminProductsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = state.products.map(prod => `
        <tr class="border-b border-slate-800 text-sm">
            <td class="py-3 px-4 text-white font-bold">${prod.name}</td>
            <td class="py-3 px-4 text-slate-400">${prod.category}</td>
            <td class="py-3 px-4 text-amber-400">R$ ${prod.price.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td class="py-3 px-4 text-slate-300">${prod.stock} vagas</td>
            <td class="py-3 px-4">
                <button type="button" onclick="deleteProduct('${prod.id}')" class="text-red-400 hover:text-red-300 transition">
                    <i data-lucide="trash" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `).join('');

    initIcons();
}

function deleteProduct(productId) {
    if (confirm('Deseja realmente remover este produto/serviço?')) {
        state.products = state.products.filter(p => p.id !== productId);
        saveState();
        renderAdminDashboard();
        renderCatalog();
    }
}

// ==========================================
// 8. PRIVACIDADE E ACESSIBILIDADE
// ==========================================
function checkCookieConsent() {
    if (state.preferences.cookiesAccepted === null) {
        const banner = document.getElementById('cookieBanner');
        if (banner) banner.classList.remove('hidden');
    }
}

function setCookieConsent(accepted) {
    state.preferences.cookiesAccepted = accepted;
    saveState();
    const banner = document.getElementById('cookieBanner');
    if (banner) banner.classList.add('hidden');
}

function applyAccessibilityPreferences() {
    const { fontSize, highContrast } = state.preferences.accessibility;
    document.body.style.fontSize = fontSize + '%';
    document.body.classList.toggle('high-contrast-mode', highContrast);
}

function toggleHighContrast() {
    state.preferences.accessibility.highContrast = !state.preferences.accessibility.highContrast;
    saveState();
    applyAccessibilityPreferences();
}

function changeFontSize(delta) {
    let current = state.preferences.accessibility.fontSize;
    current = Math.min(Math.max(current + delta, 80), 130);
    state.preferences.accessibility.fontSize = current;
    saveState();
    applyAccessibilityPreferences();
}

function resetAccessibility() {
    state.preferences.accessibility = { fontSize: 100, highContrast: false };
    saveState();
    applyAccessibilityPreferences();
}

// ==========================================
// 9. GERENCIAMENTO DE MODAIS (UI HELPERS)
// ==========================================
function openCartModal() {
    const modal = document.getElementById('cartModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

function closeCartModal() {
    const modal = document.getElementById('cartModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function openCheckoutModal() {
    closeCartModal();
    const modal = document.getElementById('checkoutModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

function closeCheckoutModal() {
    const modal = document.getElementById('checkoutModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function openAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

function openConsultingBookingModal() {
    const modal = document.getElementById('consultingModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

function closeConsultingBookingModal() {
    const modal = document.getElementById('consultingModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}
