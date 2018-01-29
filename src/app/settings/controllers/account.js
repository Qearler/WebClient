import _ from 'lodash';

/* @ngInject */
function AccountController(
    $log,
    $rootScope,
    $scope,
    $timeout,
    $state,
    CONSTANTS,
    gettextCatalog,
    $q,
    authentication,
    changePasswordModal,
    confirmModal,
    deleteAccountModal,
    desktopNotifications,
    eventManager,
    hotkeys,
    hotkeyModal,
    Key,
    loginPasswordModal,
    networkActivityTracker,
    notification,
    organizationModel,
    mailSettingsModel,
    passwords,
    pmcw,
    settingsApi,
    settingsMailApi,
    tools,
    userSettingsModel,
    User
) {
    let promisePasswordModal;
    const unsubscribe = [];
    $scope.keyPhase = CONSTANTS.KEY_PHASE;
    $scope.emailing = { announcements: false, features: false, newsletter: false, beta: false };
    $scope.locales = [
        { label: 'Deutsch', key: 'de_DE' },
        { label: 'English', key: 'en_US' },
        { label: 'Español', key: 'es_ES' },
        { label: 'Français', key: 'fr_FR' },
        { label: 'Nederlands', key: 'nl_NL' },
        { label: 'Italiano', key: 'it_IT' },
        { label: 'Polski', key: 'pl_PL' },
        { label: 'Українська', key: 'uk_UA' },
        { label: 'Pусский', key: 'ru_RU' },
        { label: 'Türkçe', key: 'tr_TR' },
        { label: 'Portugues, brasileiro', key: 'pt_BR' }
    ];
    $scope.locale = _.find($scope.locales, { key: gettextCatalog.getCurrentLanguage() }) || $scope.locales[0];
    const EMAILING_KEYS = Object.keys($scope.emailing);
    updateUser();

    function passwordModal(submit = angular.noop, onCancel = angular.noop) {
        loginPasswordModal.activate({
            params: {
                submit,
                cancel() {
                    loginPasswordModal.deactivate();
                    onCancel();
                }
            }
        });
    }

    $scope.setPasswordMode = (mode = 0) => {
        $scope.passwordMode = mode;
    };

    // Listeners

    $scope.$on('$destroy', () => {
        unsubscribe.forEach((cb) => cb());
        unsubscribe.length = 0;
    });

    $scope.saveDefaultLanguage = () => {
        const Locale = $scope.locale.key;
        const promise = settingsApi.updateLocale({ Locale }).then(() => window.location.reload());

        networkActivityTracker.track(promise);

        return promise;
    };

    $scope.enableDesktopNotifications = () => {
        desktopNotifications.request(() => {
            $scope.desktopNotificationsStatus = desktopNotifications.status();
        });
    };

    $scope.testDesktopNotification = () => {
        desktopNotifications.create(gettextCatalog.getString('You have a new email', null, 'Info'), {
            body: 'Quarterly Operations Update - Q1 2016 ',
            icon: '/assets/img/notification-badge.gif',
            onClick() {
                window.focus();
            }
        });
    };

    $scope.saveNotification = (form) => {
        function submit(currentPassword, twoFactorCode) {
            loginPasswordModal.deactivate();
            const credentials = { Password: currentPassword, TwoFactorCode: twoFactorCode };
            const promise = settingsApi.updateEmail({ Email: $scope.notificationEmail }, credentials).then(() => {
                userSettingsModel.set('NotificationEmail', $scope.notificationEmail);
                form.$setUntouched();
                form.$setPristine();
                notification.success(gettextCatalog.getString('Recovery/Notification email saved', null));
            });
            networkActivityTracker.track(promise);
        }

        passwordModal(submit);
    };

    $scope.savePasswordReset = () => {
        function submit(Password, TwoFactorCode) {
            loginPasswordModal.deactivate();
            const credentials = { Password, TwoFactorCode };
            const promise = settingsApi.passwordReset({ PasswordReset: $scope.passwordReset }, credentials).then(() => {
                notification.success(gettextCatalog.getString('Preference saved', null));
            });

            networkActivityTracker.track(promise);
        }
        const onCancel = () => ($scope.passwordReset = +!$scope.passwordReset);
        passwordModal(submit, onCancel);
    };

    $scope.saveDailyNotifications = () => {
        const promise = settingsApi.notify({ Notify: $scope.dailyNotifications }).then((data = {}) => {
            notification.success(gettextCatalog.getString('Preference saved', null));
            return data;
        });

        networkActivityTracker.track(promise);
    };

    function initAutoClose() {
        const tenMinutes = 10 * 60 * 1000;
        $timeout.cancel(promisePasswordModal);
        promisePasswordModal = $timeout(
            () => {
                if (changePasswordModal.active()) {
                    const message = gettextCatalog.getString('Operation timed out for security reasons, please try again', null);
                    changePasswordModal.deactivate();
                    notification.error(message);
                }
            },
            tenMinutes,
            false
        );
    }

    function cancelAutoClose() {
        $timeout.cancel(promisePasswordModal);
    }

    $scope.changePassword = (type = '', phase = 0) => {
        const parameters = { type, phase };
        function modal() {
            changePasswordModal.activate({
                params: {
                    phase: parameters.phase,
                    type: parameters.type,
                    close(next) {
                        changePasswordModal.deactivate();
                        if (next) {
                            parameters.phase = 2;
                            parameters.type = 'mailbox';
                            setTimeout(() => modal(), 100); // timeout required to live with Angular
                        } else {
                            cancelAutoClose();
                        }
                    }
                }
            });
        }
        function submit(currentPassword, twoFactorCode) {
            const promise = User.password({ Password: currentPassword, TwoFactorCode: twoFactorCode }).then(() => {
                loginPasswordModal.deactivate();
                initAutoClose();
                modal();
            });
            networkActivityTracker.track(promise);
        }
        passwordModal(submit);
    };

    function updateUser() {
        const { Hotkeys, ShowImages, AutoSaveContacts } = mailSettingsModel.get();
        const { PasswordMode, News, Email } = userSettingsModel.get();
        $scope.notificationEmail = Email.Value;
        $scope.passwordReset = Email.Reset;
        $scope.dailyNotifications = Email.Notify;
        $scope.desktopNotificationsStatus = desktopNotifications.status();
        $scope.autosaveContacts = AutoSaveContacts;
        $scope.images = ShowImages & CONSTANTS.REMOTE ? 1 : 0;
        $scope.embedded = ShowImages & CONSTANTS.EMBEDDED ? 2 : 0;
        $scope.hotkeys = Hotkeys;
        $scope.passwordMode = PasswordMode;
        $scope.isMember = authentication.user.Role === CONSTANTS.PAID_MEMBER_ROLE;
        setEmailingValues(News);
    }

    $scope.saveAutosaveContacts = () => {
        const promise = settingsMailApi.updateAutoSaveContacts({ AutoSaveContacts: $scope.autosaveContacts }).then(() => {
            notification.success(gettextCatalog.getString('Preference saved', null));
        });

        networkActivityTracker.track(promise);
    };

    $scope.saveImages = () => {
        const ShowImages = (mailSettingsModel.get('ShowImages') & CONSTANTS.EMBEDDED ? 2 : 0) + $scope.images;
        const promise = settingsMailApi.updateShowImages({ ShowImages }).then(() => {
            notification.success(gettextCatalog.getString('Image preferences updated', null));
        });

        networkActivityTracker.track(promise);
    };

    $scope.saveEmbedded = () => {
        const ShowImages = (mailSettingsModel.get('ShowImages') & CONSTANTS.REMOTE ? 1 : 0) + $scope.embedded;
        const promise = settingsMailApi.updateShowImages({ ShowImages }).then(() => {
            notification.success(gettextCatalog.getString('Image preferences updated', null));
        });

        networkActivityTracker.track(promise);
    };

    $scope.openHotkeyModal = () => {
        hotkeyModal.activate({
            params: {
                close() {
                    hotkeyModal.deactivate();
                }
            }
        });
    };

    $scope.saveHotkeys = () => {
        const promise = settingsMailApi.updateHotkeys({ Hotkeys: $scope.hotkeys }).then(() => {
            if ($scope.hotkeys === 1) {
                hotkeys.bind();
            } else {
                hotkeys.unbind();
            }

            notification.success(gettextCatalog.getString('Hotkeys preferences updated', null));
        });

        networkActivityTracker.track(promise);
    };

    $scope.deleteAccount = () => {
        deleteAccountModal.activate({
            params: {
                close() {
                    deleteAccountModal.deactivate();
                }
            }
        });
    };

    function setEmailingValues(value = 0) {
        _.each(EMAILING_KEYS, (key, index) => {
            $scope.emailing[key] = !!(value & (1 << index));
        });
    }

    function getEmailingValue() {
        return _.reduce(EMAILING_KEYS, (acc, key, index) => acc + ($scope.emailing[key] << index), 0);
    }

    $scope.changeEmailing = () => {
        const News = getEmailingValue();
        const successMessage = gettextCatalog.getString('Emailing preference updated', null, 'Success');

        const promise = settingsApi
            .setNews({ News })
            .then((data = {}) => {
                userSettingsModel.set('News', News);
                return data;
            })
            .then(() => notification.success(successMessage));
        networkActivityTracker.track(promise);
    };
}
export default AccountController;
