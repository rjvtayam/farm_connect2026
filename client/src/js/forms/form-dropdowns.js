/**
 * Farm Connect — Premium Dropdown Utility
 * Automatically converts native <datalist> inputs into professional searchable dropdowns.
 */

class PremiumDropdown {
    constructor(inputElement) {
        this.input = inputElement;
        this.listId = inputElement.getAttribute('list');
        this.datalist = document.getElementById(this.listId);
        
        if (!this.datalist) return;

        this.options = Array.from(this.datalist.options).map(opt => ({
            value: opt.value,
            text: opt.innerText || opt.value
        }));

        this.container = null;
        this.dropdown = null;
        this.selectedIndex = -1;
        
        this.init();
    }

    init() {
        // Disable native datalist
        this.input.removeAttribute('list');
        this.input.setAttribute('autocomplete', 'off');

        // Wrap input
        this.container = document.createElement('div');
        this.container.className = 'premium-dropdown-container';
        this.input.parentNode.insertBefore(this.container, this.input);
        this.container.appendChild(this.input);

        // Create dropdown list
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'premium-dropdown-list';
        this.container.appendChild(this.dropdown);

        // Events
        this.input.addEventListener('focus', () => this.show());
        this.input.addEventListener('input', () => this.filter());
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.hide();
            }
        });
    }

    show() {
        if (this.input.getAttribute('data-dropdown-disabled') === 'true') {
            this.hide();
            return;
        }
        this.filter();
        this.dropdown.style.display = 'block';
        this.input.classList.add('premium-select-active');
    }

    hide() {
        this.dropdown.style.display = 'none';
        this.input.classList.remove('premium-select-active');
        this.selectedIndex = -1;
    }

    filter() {
        const value = this.input.value.toLowerCase();
        const filtered = this.options.filter(opt => 
            opt.value.toLowerCase().includes(value) || 
            opt.text.toLowerCase().includes(value)
        );

        this.render(filtered);
    }

    render(items) {
        this.dropdown.innerHTML = '';
        
        if (items.length === 0) {
            this.dropdown.innerHTML = '<div class="premium-dropdown-empty">No matches found</div>';
            return;
        }

        items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'premium-dropdown-item';
            
            // Format content nicely if it has parentheses (like barangays)
            let mainText = item.value;
            let subText = item.text !== item.value ? item.text : '';
            
            if (mainText.includes('(')) {
                const parts = mainText.split('(');
                mainText = parts[0].trim();
                subText = '(' + parts[1];
            }

            div.innerHTML = `
                <span class="item-main">${mainText}</span>
                ${subText ? `<span class="item-sub">${subText}</span>` : ''}
            `;

            div.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent input blurring before select
                this.select(item.value);
            });

            this.dropdown.appendChild(div);
        });
    }

    select(value) {
        this.input.value = value;
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
        this.hide();
    }

    handleKeydown(e) {
        const items = this.dropdown.querySelectorAll('.premium-dropdown-item');
        
        if (this.dropdown.style.display === 'none') {
            if (e.key === 'ArrowDown') this.show();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
            this.updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
            this.updateSelection(items);
        } else if (e.key === 'Enter') {
            if (this.selectedIndex > -1) {
                e.preventDefault();
                items[this.selectedIndex].dispatchEvent(new Event('mousedown'));
            }
        } else if (e.key === 'Escape') {
            this.hide();
        }
    }

    updateSelection(items) {
        items.forEach((item, i) => {
            if (i === this.selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }
}

// Auto-initialize
window.addEventListener('DOMContentLoaded', () => {
    const initDropdowns = () => {
        const inputs = document.querySelectorAll('input[list]');
        inputs.forEach(input => {
            if (!input.classList.contains('premium-dropdown-initialized')) {
                new PremiumDropdown(input);
                input.classList.add('premium-dropdown-initialized');
            }
        });
    };

    initDropdowns();
    
    // Check for dynamic content (like farm parcels) periodically
    const observer = new MutationObserver((mutations) => {
        initDropdowns();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
});
