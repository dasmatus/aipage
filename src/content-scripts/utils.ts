const NAVBAR_ID = 'edubar';
const TEST_PLAYER_HEADER_CLASS = '.etest-player-header';

export function getNavbarHeight(): number {
    const testHeader = document.querySelector(TEST_PLAYER_HEADER_CLASS) as HTMLElement;
    if (testHeader && testHeader.offsetHeight > 0) return testHeader.offsetHeight;
    const navbar = document.getElementById(NAVBAR_ID);
    if (navbar && navbar.offsetHeight > 0) return navbar.offsetHeight;
    return 43;
}

export function getUserInitials(): string {
    const profileBox = document.getElementById('edubarProfileBox');
    if (!profileBox) return '';
    const name = profileBox.innerText || '';
    const initials = name.match(/[A-Z]/g) || [];
    return initials.join('');
}
