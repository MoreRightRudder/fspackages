class CJ4_PFD extends BaseAirliners {
    constructor() {
        super();
        this.isExtended = false;
        this.showTerrain = false;
        this.showWeather = false;
        this.mapDisplayMode = Jet_NDCompass_Display.ARC;
        this.previousMapDisplayMode = undefined;
        this.mapNavigationMode = Jet_NDCompass_Navigation.NAV;
        this.mapNavigationSource = 0;
        this.modeChangeTimer = -1;
        this.autoSwitchedToILS1 = false;
        this.radioSrc1 = "OFF";
        this.radioSrc2 = "OFF";
        this.initDuration = 7000;
        this._machAirpeed = undefined;
        this.isMachActive = undefined;
        this.MACH_SYNC_TIME = 1000;
        this._machSyncTimer = this.MACH_SYNC_TIME;
        this.minMode = "OFF";
        localStorage.setItem("WT_CJ4_MIN_SRC", this.minMode);
        this.fdMode = WTDataStore.get("CJ4_FD_MODE", 0);
        this._msgInfo = undefined;
        this.presetMapNavigationSource = 1;
        this.previousNavToNavTransferState = 0;
    }
    get templateID() {
        return "CJ4_PFD";
    }
    get IsGlassCockpit() {
        return true;
    }
    connectedCallback() {
        super.connectedCallback();
        RegisterViewListener("JS_LISTENER_KEYEVENT", () => {
            console.log("JS_LISTENER_KEYEVENT registered.");
        });
        this.radioNav.init(NavMode.TWO_SLOTS);
        this.horizon = new CJ4_HorizonContainer("Horizon", "PFD");
        this.map = new CJ4_MapContainer("Map", "NDMap");
        this.mapOverlay = new CJ4_MapOverlayContainer("Map", "NDMapOverlay");
        this.navBar = new CJ4_NavBarContainer("Nav", "NavBar");
        this.popup = new CJ4_PopupMenuContainer("Menu", "PopupMenu");
        this._msgInfo = document.querySelector("#MsgInfo");
        this._msgInfo.connectedCallback();
        this.addIndependentElementContainer(this.horizon);
        this.addIndependentElementContainer(this.map);
        this.addIndependentElementContainer(this.mapOverlay);
        this.addIndependentElementContainer(this.navBar);
        this.addIndependentElementContainer(this.popup);
        this.modeChangeMask = this.getChildById("ModeChangeMask");
        this.maxUpdateBudget = 12;
    }
    disconnectedCallback() {
        window.console.log("CJ4 PFD - destroyed");
        super.disconnectedCallback();
    }
    Init() {
        super.Init();
        this.radioNav.setRADIONAVSource(NavSource.GPS);
        SimVar.SetSimVarValue("L:WT_CJ4_PFD1_AOA", "Number", 0);
        SimVar.SetSimVarValue("L:WT_CJ4_V1_ON", "Bool", false);
        SimVar.SetSimVarValue("L:WT_CJ4_VR_ON", "Bool", false);
        SimVar.SetSimVarValue("L:WT_CJ4_V2_ON", "Bool", false);
        SimVar.SetSimVarValue("L:WT_CJ4_VT_ON", "Bool", false);
        SimVar.SetSimVarValue("L:WT_CJ4_VREF_ON", "Bool", false);
        SimVar.SetSimVarValue("L:WT_CJ4_VAP_ON", "Bool", false);
        SimVar.SetSimVarValue("L:WT_CJ4_LNAV_MODE", "number", this.mapNavigationSource);
        SimVar.SetSimVarValue("L:XMLVAR_Baro_Selector_HPA_1", "Bool", WTDataStore.get("CJ4_BARO_MODE", false));
        SimVar.SetSimVarValue("L:WT_CJ4_MIN_SRC", "Number", 0);
        document.documentElement.classList.add("animationsEnabled");
    }
    reboot() {
        super.reboot();
    }
    onUpdate(_deltaTime) {
        super.onUpdate(_deltaTime);
        this._msgInfo.update(_deltaTime);
        this.reversionaryMode = false;
        if (document.body.hasAttribute("reversionary")) {
            var attr = document.body.getAttribute("reversionary");
            if (attr == "true") {
                this.reversionaryMode = true;
            }
        }
        if (this.allContainersReady()) {
            if (this.modeChangeMask && this.modeChangeTimer >= 0) {
                this.modeChangeTimer -= this.deltaTime / 1000;
                if (this.modeChangeTimer <= 0) {
                    this.modeChangeMask.style.display = "none";
                    this.modeChangeTimer = -1;
                }
            }
            const dict = this.popup.dictionary;
            if (dict.changed) {
                this.readDictionary(dict);
                dict.changed = false;
            }

            const navToNavTransferState = SimVar.GetSimVarValue('L:WT_NAV_TO_NAV_TRANSFER_STATE', 'number');
            if (this.previousNavToNavTransferState !== navToNavTransferState && navToNavTransferState === 4) {
                this.radioNav.setRADIONAVSource(NavSource.VOR1);
                this.mapNavigationMode = Jet_NDCompass_Navigation.VOR;

                this.mapNavigationSource = 1;
                this.presetMapNavigationSource = 0;
                this.mapOverlay.compass.root.navPreset.setPreset(this.presetMapNavigationSource);

                if (this.mapDisplayMode === Jet_NDCompass_Display.PPOS) {
                    this.mapDisplayMode = Jet_NDCompass_Display.ARC;
                }

                this.onModeChanged();
            }
            
            if (this.mapNavigationSource === 0 && navToNavTransferState >= 3 && this.presetMapNavigationSource !== 1) {
                this.presetMapNavigationSource = 1;
                this.mapOverlay.compass.root.navPreset.setPreset(this.presetMapNavigationSource);
            }

            this.previousNavToNavTransferState = navToNavTransferState;

            if (this.mapNavigationMode === Jet_NDCompass_Navigation.VOR) {
                const radioFix = this.radioNav.getVORBeacon(this.mapNavigationSource);
                if (radioFix.name && radioFix.name.indexOf("ILS") !== -1) {
                    this.mapNavigationMode = Jet_NDCompass_Navigation.ILS;
                }
            }

            // TODO: refactor VNAV alt to SVG

            // let isAltConstraint = (SimVar.GetSimVarValue("L:WT_CJ4_CONSTRAINT_ALTITUDE", "number") > 0);
            // let vnavAltEl = document.getElementById("VnavAlt");
            // vnavAltEl.style.display = isAltConstraint ? "" : "none";
            // if (isAltConstraint) {
            //     vnavAltEl.textContent = SimVar.GetSimVarValue("L:WT_CJ4_CONSTRAINT_ALTITUDE", "number").toFixed(0);
            // }

            const isAltConstraint = localStorage.getItem("WT_CJ4_CONSTRAINT");
            const vnavAltEl = document.getElementById("VnavAlt");
            vnavAltEl.style.display = isAltConstraint ? "" : "none";
            if (isAltConstraint) {
                vnavAltEl.textContent = localStorage.getItem("WT_CJ4_CONSTRAINT");
            }

            this.map.setMode(this.mapDisplayMode);
            this.mapOverlay.setMode(this.mapDisplayMode, this.mapNavigationMode, this.mapNavigationSource);

            //Hack to correct the map compass size until we separate it out
            //fully from the default shared code
            if (this.mapDisplayMode !== this.previousMapDisplayMode || this.mapNavigationSource !== this.previousMapNavigationSource) {
                const el = document.querySelector('#NDCompass svg');
                if (el) {
                    this.previousMapDisplayMode = this.mapDisplayMode;
                    this.previousMapNavigationSource = this.mapNavigationSource;

                    if (this.mapDisplayMode === Jet_NDCompass_Display.ROSE) {
                        el.setAttribute('width', '122%');
                        el.setAttribute('height', '122%');
                        el.style = 'transform: translate(-84px, -56px)';
                    }

                    if (this.mapDisplayMode === Jet_NDCompass_Display.ARC || this.mapDisplayMode === Jet_NDCompass_Display.PPOS) {
                        el.setAttribute('width', '108%');
                        el.setAttribute('height', '108%');
                        el.style = 'transform: translate(-30px, -18px)';
                    }
                }
                this.mapOverlay.infos.root.onDisplayChange(this.mapDisplayMode);
            }

            if (this.showTerrain) {
                this.map.showMap(true);

                if (this.mapDisplayMode === Jet_NDCompass_Display.ARC || this.mapDisplayMode === Jet_NDCompass_Display.ROSE) {
                    this.map.showRoute(false);
                    this.map.map.instrument.setAttribute('show-airplane', 'false');
                } else {
                    this.map.showRoute(true);
                    this.map.map.instrument.setAttribute('show-airplane', 'true');
                }

                this.map.showTerrain(true);
                this.mapOverlay.showTerrain(true);
            } else if (this.showWeather) {
                this.map.showMap(true);

                if (this.mapDisplayMode === Jet_NDCompass_Display.ARC || this.mapDisplayMode === Jet_NDCompass_Display.ROSE) {
                    this.map.showRoute(false);
                    this.map.map.instrument.setAttribute('show-airplane', 'false');
                } else {
                    this.map.showRoute(true);
                    this.map.map.instrument.setAttribute('show-airplane', 'true');
                }

                this.map.showWeather(true);
                this.mapOverlay.showWeather(true);
            } else {
                if (this.mapDisplayMode === Jet_NDCompass_Display.ARC || this.mapDisplayMode === Jet_NDCompass_Display.ROSE) {
                    this.map.showMap(false);
                    this.map.showRoute(false);

                    this.map.map.instrument.setAttribute('show-airplane', 'false');
                } else {
                    this.map.showMap(true);
                    this.map.showRoute(true);

                    this.map.map.instrument.setAttribute('show-airplane', 'true');
                }

                this.map.showTerrain(false);
                this.mapOverlay.showTerrain(false);
                this.map.showWeather(false);
                this.mapOverlay.showWeather(false);
            }
            if (this.isExtended) {
                this.map.setExtended(true);
                this.mapOverlay.setExtended(true);
                this.horizon.show(false);
            } else {
                this.map.setExtended(false);
                this.mapOverlay.setExtended(false);
                this.horizon.show(true);
            }
            this.mapOverlay.setRange(this.map.range);
        }

        const rangeSelectDisabled = WTDataStore.get('WT_CJ4_RANGE_SEL_DISABLED', 0);
        if (rangeSelectDisabled) {
            this.map.map.instrument.showAltitudeIntercept = false;
        } else {
            this.map.map.instrument.showAltitudeIntercept = true;
        }

        if (this.currFlightPlanManager.isActiveApproach() && this.currFlightPlanManager.getActiveWaypointIndex() != -1 && Simplane.getAutoPilotApproachType() == 4 && SimVar.GetSimVarValue("AUTOPILOT APPROACH ACTIVE", "boolean")) {
            if (this.radioNav.getRADIONAVSource() == NavSource.GPS) {
                this.radioNav.setRADIONAVSource(NavSource.VOR1);
                this.autoSwitchedToILS1 = true;
            }
        } else {
            if (this.autoSwitchedToILS1) {
                if (this.mapNavigationMode == Jet_NDCompass_Navigation.NAV) {
                    this.radioNav.setRADIONAVSource(NavSource.GPS);
                } else if (this.mapNavigationMode == Jet_NDCompass_Navigation.VOR && this.mapNavigationSource == 1) {
                    this.radioNav.setRADIONAVSource(NavSource.VOR1);
                } else if (this.mapNavigationMode == Jet_NDCompass_Navigation.VOR && this.mapNavigationSource == 2) {
                    this.radioNav.setRADIONAVSource(NavSource.VOR2);
                }
                this.autoSwitchedToILS1 = false;
            }
        }

        this.updateMachTransition(_deltaTime);
    }
    updateMachTransition(_deltaTime) {
        this._machSyncTimer -= _deltaTime;
        const cruiseMach = 0.64; // TODO: change this when cruise mach becomes settable
        // let cruiseMach = SimVar.GetGameVarValue("AIRCRAFT CRUISE MACH", "mach");
        const mach = Simplane.getMachSpeed();
        switch (this.machTransition) {
            case 0:
                if (mach >= cruiseMach) {
                    this.machTransition = 1;
                    SimVar.SetSimVarValue("L:XMLVAR_AirSpeedIsInMach", "bool", true);
                    SimVar.SetSimVarValue("L:AIRLINER_FMC_FORCE_NEXT_UPDATE", "number", 1);
                }
                break;
            case 1:
                if (mach < cruiseMach - 0.01) {
                    this.machTransition = 0;
                    SimVar.SetSimVarValue("L:XMLVAR_AirSpeedIsInMach", "bool", false);
                    SimVar.SetSimVarValue("L:AIRLINER_FMC_FORCE_NEXT_UPDATE", "number", 1);
                }
                break;
        }
        const isMachActive = SimVar.GetSimVarValue("L:XMLVAR_AirSpeedIsInMach", "bool");
        if (this.isMachActive != isMachActive) {
            this.isMachActive = isMachActive;
            if (isMachActive) {
                Coherent.call("AP_MACH_VAR_SET", 0, cruiseMach);
            } else {
                const knots = SimVar.GetGameVarValue("FROM MACH TO KIAS", "number", Simplane.getAutoPilotMachHoldValue());
                Coherent.call("AP_SPD_VAR_SET", 1, knots);
            }
            return true;
        } else {
            // DONT DELETE: mach mode fix
            const machAirspeed = Simplane.getAutoPilotMachHoldValue();
            if (this.isMachActive && this._machAirpeed == machAirspeed && this._machSyncTimer < 0) {
                this._machAirpeed = machAirspeed;
                Coherent.call("AP_MACH_VAR_SET", 0, machAirspeed);
                this._machSyncTimer = this.MACH_SYNC_TIME;
            } else {
                this._machAirpeed = machAirspeed;
            }
        }
        return false;
    }
    onEvent(_event) {
        switch (_event) {
            case "Upr_Push_NAV":

                this.swapNavSource();
                break;
            case "Upr_Push_FRMT":
                if (this.mapDisplayMode == Jet_NDCompass_Display.ARC) {
                    this.mapDisplayMode = Jet_NDCompass_Display.ROSE;
                } else if (this.mapDisplayMode == Jet_NDCompass_Display.ROSE) {
                    if (this.mapNavigationSource === 0) {
                        this.mapDisplayMode = Jet_NDCompass_Display.PPOS;
                    } else {
                        this.mapDisplayMode = Jet_NDCompass_Display.ARC;
                    }
                } else {
                    this.mapDisplayMode = Jet_NDCompass_Display.ARC;
                }

                this.onModeChanged();
                break;
            case "Upr_Push_TERR_WX":
                if (this.showTerrain) {
                    this.showTerrain = false;
                    this.showWeather = true;
                } else if (this.showWeather) {
                    this.showTerrain = false;
                    this.showWeather = false;
                } else {
                    this.showTerrain = true;
                    this.showWeather = false;
                }
                this.onModeChanged();
                break;
            case "Upr_Push_TFC":
                this.map.toggleSymbol(CJ4_MapSymbol.TRAFFIC);
                break;
            case "Upr_RANGE_INC":
                this.map.rangeInc();
                break;
            case "Upr_RANGE_DEC":
                this.map.rangeDec();
                break;
            case "Upr_Push_PFD_MENU":
                this.fillDictionary(this.popup.dictionary);
                this.popup.setMode(CJ4_PopupMenu.PFD);
                break;
            case "Upr_Push_REFS_MENU":
                this.fillDictionary(this.popup.dictionary);
                this.popup.setMode(CJ4_PopupMenu.REFS);
                break;
            case "Upr_Push_ET":
                if (!this.mapOverlay._showET) {
                    this.mapOverlay._showET = true;
                    this.mapOverlay._chronoValue = 0;
                    this.mapOverlay._chronoStarted = true;
                } else if (this.mapOverlay._chronoStarted) {
                    this.mapOverlay._chronoStarted = false;
                } else {
                    this.mapOverlay._showET = false;
                }
                break;
            case "Upr_DATA_INC":
                if (this.popup.mode == CJ4_PopupMenu.NONE) {
                    this.scrollNavPresetForward();
                    this.mapOverlay.compass.root.navPreset.setPreset(this.presetMapNavigationSource);
                }
                break;
            case "Upr_DATA_DEC":
                if (this.popup.mode == CJ4_PopupMenu.NONE) {
                    this.scrollNavPresetBackward();
                    this.mapOverlay.compass.root.navPreset.setPreset(this.presetMapNavigationSource);
                }
                break;
        }
    }
    scrollNavPresetForward() {
        do {
            this.presetMapNavigationSource++;
            if (this.presetMapNavigationSource > 2) {
                this.presetMapNavigationSource = 0;
            }
        } while (this.presetMapNavigationSource === this.mapNavigationSource);
    }
    scrollNavPresetBackward() {
        do {
            this.presetMapNavigationSource--;
            if (this.presetMapNavigationSource < 0) {
                this.presetMapNavigationSource = 2;
            }
        } while (this.presetMapNavigationSource === this.mapNavigationSource);
    }
    swapNavSource() {
        const preset = this.presetMapNavigationSource;
        this.presetMapNavigationSource = this.mapNavigationSource;
        this.mapNavigationSource = preset;

        this.mapOverlay.compass.root.navPreset.setPreset(this.presetMapNavigationSource);

        switch (this.mapNavigationSource) {
            case 0:
                this.radioNav.setRADIONAVSource(NavSource.GPS);
                this.mapNavigationMode = Jet_NDCompass_Navigation.NAV;
                break;
            case 1:
                this.radioNav.setRADIONAVSource(NavSource.VOR1);
                this.mapNavigationMode = Jet_NDCompass_Navigation.VOR;

                if (this.mapDisplayMode === Jet_NDCompass_Display.PPOS) {
                    this.mapDisplayMode = Jet_NDCompass_Display.ARC;
                }
                break;
            case 2:
                this.radioNav.setRADIONAVSource(NavSource.VOR2);
                this.mapNavigationMode = Jet_NDCompass_Navigation.VOR;
                SimVar.SetSimVarValue('K:AP_NAV_SELECT_SET', 'number', 2);

                if (this.mapDisplayMode === Jet_NDCompass_Display.PPOS) {
                    this.mapDisplayMode = Jet_NDCompass_Display.ARC;
                }
                break;
        }

        this.onModeChanged();
    }
    allContainersReady() {
        for (var i = 0; i < this.IndependentsElements.length; i++) {
            if (!this.IndependentsElements[i].isInitialized) {
                return false;
            }
        }
        return true;
    }
    onModeChanged() {
        SimVar.SetSimVarValue("L:CJ4_MAP_MODE", "number", this.mapDisplayMode);
        SimVar.SetSimVarValue("L:WT_CJ4_LNAV_MODE", "number", this.mapNavigationSource);
        SimVar.SetSimVarValue("L:FMC_UPDATE_CURRENT_PAGE", "number", 1);
        if (this.modeChangeMask) {
            this.modeChangeMask.style.display = "block";
            this.modeChangeTimer = 0.15;
        }
    }
    readDictionary(_dict) {
        let modeChanged = false;
        const format = _dict.get(CJ4_PopupMenu_Key.MAP_FORMAT);
        if (format == "ROSE") {
            if (this.mapDisplayMode != Jet_NDCompass_Display.ROSE) {
                this.mapDisplayMode = Jet_NDCompass_Display.ROSE;
                modeChanged = true;
            }
        } else if (format == "ARC") {
            if (this.mapDisplayMode != Jet_NDCompass_Display.ARC) {
                this.mapDisplayMode = Jet_NDCompass_Display.ARC;
                modeChanged = true;
            }
        } else if (format == "PPOS") {
            if (this.mapDisplayMode != Jet_NDCompass_Display.PPOS) {
                this.mapDisplayMode = Jet_NDCompass_Display.PPOS;
                modeChanged = true;
            }
        }
        const range = _dict.get(CJ4_PopupMenu_Key.MAP_RANGE);
        this.map.range = parseInt(range);

        const overlay = _dict.get(CJ4_PopupMenu_Key.PFD_MAP_OVERLAY);
        if (overlay == "TERR") {
            this.showTerrain = true;
            this.showWeather = false;
        } else if (overlay == "WX") {
            this.showTerrain = false;
            this.showWeather = true;
        } else {
            this.showTerrain = false;
            this.showWeather = false;
        }

        const navSrc = _dict.get(CJ4_PopupMenu_Key.NAV_SRC);
        if (navSrc == "FMS1") {
            if (this.mapNavigationMode != Jet_NDCompass_Navigation.NAV) {
                this.mapNavigationMode = Jet_NDCompass_Navigation.NAV;
                this.mapNavigationSource = 0;
                this.radioNav.setRADIONAVSource(NavSource.GPS);
                modeChanged = true;
            }
        } else if (navSrc == "VOR1") {
            if (this.mapNavigationMode != Jet_NDCompass_Navigation.VOR || this.mapNavigationSource != 1) {
                this.mapNavigationMode = Jet_NDCompass_Navigation.VOR;
                this.mapNavigationSource = 1;
                this.radioNav.setRADIONAVSource(NavSource.VOR1);
                modeChanged = true;
            }
        } else if (navSrc == "VOR2") {
            if (this.mapNavigationMode != Jet_NDCompass_Navigation.VOR || this.mapNavigationSource != 2) {
                this.mapNavigationMode = Jet_NDCompass_Navigation.VOR;
                this.mapNavigationSource = 2;
                this.radioNav.setRADIONAVSource(NavSource.VOR2);
                modeChanged = true;
            }
        }

        const baroUnits = _dict.get(CJ4_PopupMenu_Key.UNITS_PRESS);
        SimVar.SetSimVarValue("L:XMLVAR_Baro_Selector_HPA_1", "Bool", (baroUnits == "HPA") ? 1 : 0);
        WTDataStore.set("CJ4_BARO_MODE", (baroUnits == "HPA") ? true : false);

        const baroUnit = _dict.get(CJ4_PopupMenu_Key.BARO_STD);
        if (baroUnit == "STD") {
            SimVar.SetSimVarValue("L:XMLVAR_Baro1_ForcedToSTD", "Bool", true);
            const baroSetting = 1013.25 * 16;
            SimVar.SetSimVarValue("K:KOHLSMAN_SET", "number", baroSetting);
        } else {
            SimVar.SetSimVarValue("L:XMLVAR_Baro1_ForcedToSTD", "Bool", false);
            const baroSetting = _dict.get(CJ4_PopupMenu_Key.BARO_SET);
            if (_dict.get(CJ4_PopupMenu_Key.BARO_SET) < 500) {
                SimVar.SetSimVarValue("K:KOHLSMAN_SET", "number", baroSetting * 33.864 * 16);
            } else {
                SimVar.SetSimVarValue("K:KOHLSMAN_SET", "number", baroSetting * 16);
            }
        }

        const mtrsOn = _dict.get(CJ4_PopupMenu_Key.UNITS_MTR_ALT);
        this.horizon.showMTRS((mtrsOn == "ON") ? true : false);
        WTDataStore.set("CJ4_MTRS_MODE", (mtrsOn == "ON") ? true : false);

        const fltDirStatus = _dict.get(CJ4_PopupMenu_Key.FLT_DIR);
        this.fdMode = fltDirStatus == "X-PTR" ? 1 : 0;
        WTDataStore.set("CJ4_FD_MODE", this.fdMode);

        const aoaSetting = _dict.get(CJ4_PopupMenu_Key.AOA);
        if (aoaSetting) {
            if (aoaSetting == "AUTO") {
                SimVar.SetSimVarValue("L:WT_CJ4_PFD1_AOA", "Number", 0);
            } else if (aoaSetting == "ON") {
                SimVar.SetSimVarValue("L:WT_CJ4_PFD1_AOA", "Number", 1);
            } else if (aoaSetting == "OFF") {
                SimVar.SetSimVarValue("L:WT_CJ4_PFD1_AOA", "Number", 2);
            }
        }
        const v1 = _dict.get(CJ4_PopupMenu_Key.VSPEED_V1);
        const vR = _dict.get(CJ4_PopupMenu_Key.VSPEED_VR);
        const v2 = _dict.get(CJ4_PopupMenu_Key.VSPEED_V2);
        const vT = _dict.get(CJ4_PopupMenu_Key.VSPEED_VT);
        const vRef = _dict.get(CJ4_PopupMenu_Key.VSPEED_VRF);
        const vApp = _dict.get(CJ4_PopupMenu_Key.VSPEED_VAP);
        WTDataStore.set("CJ4_V1_SELECT", v1)
        WTDataStore.set("CJ4_VR_SELECT", vR)
        WTDataStore.set("CJ4_V2_SELECT", v2)
        WTDataStore.set("CJ4_VT_SELECT", vT)
        WTDataStore.set("CJ4_VREF_SELECT", vRef)
        WTDataStore.set("CJ4_VAP_SELECT", vApp)
        const v1_on = (_dict.get(CJ4_PopupMenu_Key.VSPEED_V1_ON) == "ON") ? true : false;
        const vR_on = (_dict.get(CJ4_PopupMenu_Key.VSPEED_VR_ON) == "ON") ? true : false;
        const v2_on = (_dict.get(CJ4_PopupMenu_Key.VSPEED_V2_ON) == "ON") ? true : false;
        const vT_on = (_dict.get(CJ4_PopupMenu_Key.VSPEED_VT_ON) == "ON") ? true : false;
        const vRef_on = (_dict.get(CJ4_PopupMenu_Key.VSPEED_VRF_ON) == "ON") ? true : false;
        const vApp_on = (_dict.get(CJ4_PopupMenu_Key.VSPEED_VAP_ON) == "ON") ? true : false;
        
        if(v1_on){
            SimVar.SetSimVarValue("L:WT_CJ4_V1_FMCSET", "Bool", false);
            SimVar.SetSimVarValue("L:WT_CJ4_V1_ON", "Bool", true);
            SimVar.SetSimVarValue("L:WT_CJ4_V1_SPEED", "Knots", parseInt(v1));
        }else{
            SimVar.SetSimVarValue("L:WT_CJ4_V1_ON", "Bool", SimVar.GetSimVarValue("L:WT_CJ4_V1_FMCSET", "Bool") ? true : false);
        }
        if(vR_on){
            SimVar.SetSimVarValue("L:WT_CJ4_VR_FMCSET", "Bool", false);
            SimVar.SetSimVarValue("L:WT_CJ4_VR_ON", "Bool", true);
            SimVar.SetSimVarValue("L:WT_CJ4_VR_SPEED", "Knots", parseInt(vR));
        }else{
            SimVar.SetSimVarValue("L:WT_CJ4_VR_ON", "Bool", SimVar.GetSimVarValue("L:WT_CJ4_VR_FMCSET", "Bool") ? true : false);
        }
        if(v2_on){
            SimVar.SetSimVarValue("L:WT_CJ4_V2_FMCSET", "Bool", false);
            SimVar.SetSimVarValue("L:WT_CJ4_V2_ON", "Bool", true);
            SimVar.SetSimVarValue("L:WT_CJ4_V2_SPEED", "Knots", parseInt(v2));
        }else{
            SimVar.SetSimVarValue("L:WT_CJ4_V2_ON", "Bool", SimVar.GetSimVarValue("L:WT_CJ4_V2_FMCSET", "Bool") ? true : false);
        }
        if(vT_on){
            SimVar.SetSimVarValue("L:WT_CJ4_VT_FMCSET", "Bool", false);
            SimVar.SetSimVarValue("L:WT_CJ4_VT_ON", "Bool", true);
            SimVar.SetSimVarValue("L:WT_CJ4_VT_SPEED", "Knots", parseInt(vT));
        }else{
            SimVar.SetSimVarValue("L:WT_CJ4_VT_ON", "Bool", SimVar.GetSimVarValue("L:WT_CJ4_VT_FMCSET", "Bool") ? true : false);
        }
        if(vApp_on){
            SimVar.SetSimVarValue("L:WT_CJ4_VAP_FMCSET", "Bool", false);
            SimVar.SetSimVarValue("L:WT_CJ4_VAP_ON", "Bool", true);
            SimVar.SetSimVarValue("L:WT_CJ4_VAP_SPEED", "Knots", parseInt(vApp));
        }else{
            SimVar.SetSimVarValue("L:WT_CJ4_VAP_ON", "Bool", SimVar.GetSimVarValue("L:WT_CJ4_VAP_FMCSET", "Bool") ? true : false);
        }
        if(vRef_on){
            SimVar.SetSimVarValue("L:WT_CJ4_VREF_FMCSET", "Bool", false);
            SimVar.SetSimVarValue("L:WT_CJ4_VREF_ON", "Bool", true);
            SimVar.SetSimVarValue("L:WT_CJ4_VREF_SPEED", "Knots", parseInt(vRef));
        }else{
            SimVar.SetSimVarValue("L:WT_CJ4_VREF_ON", "Bool", SimVar.GetSimVarValue("L:WT_CJ4_VREF_FMCSET", "Bool") ? true : false);
        }

        this.minMode = _dict.get(CJ4_PopupMenu_Key.MIN_ALT_SRC);
        switch (this.minMode) {
            case "BARO":
                SimVar.SetSimVarValue("L:WT_CJ4_MIN_SRC", "Number", 1);
                break;
            case "RA":
                SimVar.SetSimVarValue("L:WT_CJ4_MIN_SRC", "Number", 2);
                break;
            default:
                SimVar.SetSimVarValue("L:WT_CJ4_MIN_SRC", "Number", 0);
                break;
        }
        const baroSet = parseInt(_dict.get(CJ4_PopupMenu_Key.MIN_ALT_BARO));
        SimVar.SetSimVarValue("L:WT_CJ4_BARO_SET", "Number", baroSet);
        WTDataStore.set("CJ4_MIN_BARO", baroSet);
        const raSet = parseInt(_dict.get(CJ4_PopupMenu_Key.MIN_ALT_RADIO));
        SimVar.SetSimVarValue("L:WT_CJ4_RADIO_SET", "Number", raSet);
        WTDataStore.set("CJ4_MIN_RADIO", raSet);

        this.radioSrc1 = _dict.get(CJ4_PopupMenu_Key.BRG_PTR1_SRC);
        this.radioSrc2 = _dict.get(CJ4_PopupMenu_Key.BRG_PTR2_SRC);

        if (this.radioSrc1 !== 'OFF') {
            if (this.radioSrc1 == "VOR1") {
                SimVar.SetSimVarValue('L:WT.CJ4.BearingPointerMode_1', 'number', 2);
            } else if (this.radioSrc1 == "ADF1") {
                SimVar.SetSimVarValue('L:WT.CJ4.BearingPointerMode_1', 'number', 3);
            } else {
                SimVar.SetSimVarValue('L:WT.CJ4.BearingPointerMode_1', 'number', 1);
            }
        } else {
            SimVar.SetSimVarValue('L:WT.CJ4.BearingPointerMode_1', 'number', 0);
        }

        if (this.radioSrc2 !== 'OFF') {
            if (this.radioSrc2 == "VOR2") {
                SimVar.SetSimVarValue('L:WT.CJ4.BearingPointerMode_2', 'number', 2);
            } else if (this.radioSrc2 == "ADF2") {
                SimVar.SetSimVarValue('L:WT.CJ4.BearingPointerMode_2', 'number', 3);
            } else {
                SimVar.SetSimVarValue('L:WT.CJ4.BearingPointerMode_2', 'number', 1);
            }
        } else {
            SimVar.SetSimVarValue('L:WT.CJ4.BearingPointerMode_2', 'number', 0);
        }

        if (modeChanged) {
            this.onModeChanged();
        }
    }
    fillDictionary(_dict) {
        if (this.mapDisplayMode == Jet_NDCompass_Display.ROSE) {
            _dict.set(CJ4_PopupMenu_Key.MAP_FORMAT, "ROSE");
        } else if (this.mapDisplayMode == Jet_NDCompass_Display.ARC) {
            _dict.set(CJ4_PopupMenu_Key.MAP_FORMAT, "ARC");
        } else if (this.mapDisplayMode == Jet_NDCompass_Display.PPOS) {
            _dict.set(CJ4_PopupMenu_Key.MAP_FORMAT, "PPOS");
        }
        _dict.set(CJ4_PopupMenu_Key.MAP_RANGE, this.map.range.toString());

        if (this.showTerrain) {
            _dict.set(CJ4_PopupMenu_Key.PFD_MAP_OVERLAY, "TERR");
        } else if (this.showWeather) {
            _dict.set(CJ4_PopupMenu_Key.PFD_MAP_OVERLAY, "WX");
        } else {
            _dict.set(CJ4_PopupMenu_Key.PFD_MAP_OVERLAY, "OFF");
        }

        if (this.mapNavigationMode == Jet_NDCompass_Navigation.VOR && this.mapNavigationSource == 1) {
            _dict.set(CJ4_PopupMenu_Key.NAV_SRC, "VOR1");
        } else if (this.mapNavigationMode == Jet_NDCompass_Navigation.VOR && this.mapNavigationSource == 2) {
            _dict.set(CJ4_PopupMenu_Key.NAV_SRC, "VOR2");
        } else if (this.mapNavigationMode == Jet_NDCompass_Navigation.NAV) {
            _dict.set(CJ4_PopupMenu_Key.NAV_SRC, "FMS1");
        }

        const baroHPA = WTDataStore.get("CJ4_BARO_MODE", false);
        if (Simplane.getPressureSelectedMode() != "STD") {
            if (baroHPA) {
                _dict.set(CJ4_PopupMenu_Key.BARO_SET, Simplane.getPressureValue("millibars"));
                _dict.set(CJ4_PopupMenu_Key.BARO_STD, "HPA");
            } else {
                _dict.set(CJ4_PopupMenu_Key.BARO_SET, Simplane.getPressureValue("inches of mercury"));
                _dict.set(CJ4_PopupMenu_Key.BARO_STD, "IN");
            }
        } else {
            _dict.set(CJ4_PopupMenu_Key.BARO_STD, "STD");
        }
        SimVar.SetSimVarValue("L:XMLVAR_Baro_Selector_HPA_1", "Bool", baroHPA);
        _dict.set(CJ4_PopupMenu_Key.UNITS_PRESS, (baroHPA) ? "HPA" : "IN");
        _dict.set(CJ4_PopupMenu_Key.UNITS_MTR_ALT, (this.horizon.isMTRSVisible()) ? "ON" : "OFF");
        _dict.set(CJ4_PopupMenu_Key.FLT_DIR, (this.fdMode == 1) ? "X-PTR" : "V-BAR");
        const aoaSettingFill = SimVar.GetSimVarValue("L:WT_CJ4_PFD1_AOA", "Number").toFixed(0);
        if (aoaSettingFill) {
            if (aoaSettingFill == 0) {
                _dict.set(CJ4_PopupMenu_Key.AOA, "AUTO");
            } else if (aoaSettingFill == 1) {
                _dict.set(CJ4_PopupMenu_Key.AOA, "ON");
            } else if (aoaSettingFill == 2) {
                _dict.set(CJ4_PopupMenu_Key.AOA, "OFF");
            }
        }
        const v1 = SimVar.GetSimVarValue("L:WT_CJ4_V1_SPEED", "Knots").toFixed(0);
        const v1_on = SimVar.GetSimVarValue("L:WT_CJ4_V1_ON", "Bool");
        const v1_sel = v1_on && !SimVar.GetSimVarValue("L:WT_CJ4_V1_FMCSET", "Bool");
        const vR = SimVar.GetSimVarValue("L:WT_CJ4_VR_SPEED", "Knots").toFixed(0);
        const vR_on = SimVar.GetSimVarValue("L:WT_CJ4_VR_ON", "Bool");
        const vR_sel = vR_on && !SimVar.GetSimVarValue("L:WT_CJ4_VR_FMCSET", "Bool");
        const v2 = SimVar.GetSimVarValue("L:WT_CJ4_V2_SPEED", "Knots").toFixed(0);
        const v2_on = SimVar.GetSimVarValue("L:WT_CJ4_V2_ON", "Bool");
        const v2_sel = v2_on && !SimVar.GetSimVarValue("L:WT_CJ4_V2_FMCSET", "Bool");
        const vT = SimVar.GetSimVarValue("L:WT_CJ4_VT_SPEED", "Knots").toFixed(0);
        const vT_on = SimVar.GetSimVarValue("L:WT_CJ4_VT_ON", "Bool");
        const vT_sel = vT_on && !SimVar.GetSimVarValue("L:WT_CJ4_VT_FMCSET", "Bool");
        const vRef = SimVar.GetSimVarValue("L:WT_CJ4_VREF_SPEED", "Knots").toFixed(0);
        const vRef_on = SimVar.GetSimVarValue("L:WT_CJ4_VREF_ON", "Bool");
        const vRef_sel = vRef_on && !SimVar.GetSimVarValue("L:WT_CJ4_VREF_FMCSET", "Bool");
        const vApp = SimVar.GetSimVarValue("L:WT_CJ4_VAP_SPEED", "Knots").toFixed(0);
        const vApp_on = SimVar.GetSimVarValue("L:WT_CJ4_VAP_ON", "Bool");
        const vApp_sel = vApp_on && !SimVar.GetSimVarValue("L:WT_CJ4_VAP_FMCSET", "Bool");
        _dict.set(CJ4_PopupMenu_Key.VSPEED_V1, v1_on ? v1 : WTDataStore.get("CJ4_V1_SELECT", 50));
        _dict.set(CJ4_PopupMenu_Key.VSPEED_VR, vR_on ? vR : WTDataStore.get("CJ4_VR_SELECT", 50));
        _dict.set(CJ4_PopupMenu_Key.VSPEED_V2, v2_on ? v2 : WTDataStore.get("CJ4_V2_SELECT", 50));
        _dict.set(CJ4_PopupMenu_Key.VSPEED_VT, vT_on ? vT : WTDataStore.get("CJ4_VT_SELECT", 50));
        _dict.set(CJ4_PopupMenu_Key.VSPEED_VRF, vRef_on ? vRef : WTDataStore.get("CJ4_VREF_SELECT", 50));
        _dict.set(CJ4_PopupMenu_Key.VSPEED_VAP, vApp_on ? vApp : WTDataStore.get("CJ4_VAP_SELECT", 50));
        _dict.set(CJ4_PopupMenu_Key.VSPEED_V1_ON, v1_sel ? "ON" : "OFF");
        _dict.set(CJ4_PopupMenu_Key.VSPEED_VR_ON, vR_sel ? "ON" : "OFF");
        _dict.set(CJ4_PopupMenu_Key.VSPEED_V2_ON, v2_sel ? "ON" : "OFF");
        _dict.set(CJ4_PopupMenu_Key.VSPEED_VT_ON, vT_sel ? "ON" : "OFF");
        _dict.set(CJ4_PopupMenu_Key.VSPEED_VRF_ON, vRef_sel ? "ON" : "OFF");
        _dict.set(CJ4_PopupMenu_Key.VSPEED_VAP_ON, vApp_sel ? "ON" : "OFF");
        _dict.set(CJ4_PopupMenu_Key.MIN_ALT_SRC, this.minMode);
        _dict.set(CJ4_PopupMenu_Key.MIN_ALT_BARO, WTDataStore.get("CJ4_MIN_BARO", 0));
        _dict.set(CJ4_PopupMenu_Key.MIN_ALT_RADIO, WTDataStore.get("CJ4_MIN_RADIO", 0));
        _dict.set(CJ4_PopupMenu_Key.BRG_PTR1_SRC, this.radioSrc1);
        _dict.set(CJ4_PopupMenu_Key.BRG_VOR1_FREQ, this.radioNav.getVORActiveFrequency(1).toFixed(3));
        _dict.set(CJ4_PopupMenu_Key.BRG_ADF1_FREQ, this.radioNav.getADFActiveFrequency(1).toFixed(0));
        _dict.set(CJ4_PopupMenu_Key.BRG_PTR2_SRC, this.radioSrc2);
        _dict.set(CJ4_PopupMenu_Key.BRG_VOR2_FREQ, this.radioNav.getVORActiveFrequency(2).toFixed(3));
        _dict.set(CJ4_PopupMenu_Key.BRG_ADF2_FREQ, this.radioNav.getADFActiveFrequency(2).toFixed(0));
        _dict.changed = false;
    }
}
class CJ4_HorizonContainer extends NavSystemElementContainer {
    constructor(_name, _root) {
        super(_name, _root, null);
        this.isVisible = undefined;
        this.altimeter = new CJ4_Altimeter();
        this.element = new NavSystemElementGroup([
            new CJ4_Attitude(),
            new CJ4_VSpeed(),
            new CJ4_Airspeed(),
            this.altimeter,
            new CJ4_AOA(),
            new CJ4_APDisplay(),
            new CJ4_ILS()
        ]);
    }
    init() {
        super.init();
        this.root = this.gps.getChildById(this.htmlElemId);
        if (!this.root) {
            console.log("Root component expected!");
        }
    }
    show(_value) {
        if (this.isVisible != _value) {
            this.isVisible = _value;
            this.root.setAttribute("visible", (_value) ? "true" : "false");
        }
    }
    showMTRS(_val) {
        this.altimeter.showMTRS(_val);
    }
    isMTRSVisible() {
        return this.altimeter.isMTRSVisible();
    }
}
class CJ4_AOA extends NavSystemElement {
    init(root) {
        this.aoa = this.gps.getChildById("AOA");
        this.aoa.aircraft = Aircraft.CJ4;
        this.aoa.gps = this.gps;
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {
        var angle = fastToFixed(Simplane.getAngleOfAttack(), 1);
        //AoA only visible when flaps 35
        this.aoa.setAttribute("angle", angle);
        const flap35Active = SimVar.GetSimVarValue("TRAILING EDGE FLAPS LEFT PERCENT", "Percent");
        const aoaActive = SimVar.GetSimVarValue("L:WT_CJ4_PFD1_AOA", "Number");
        if ((flap35Active == 100 && aoaActive !== 2) || aoaActive == 1) {
            this.aoa.style = "";
        } else {
            this.aoa.style = "display: none";
        }
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class CJ4_VSpeed extends NavSystemElement {
    init(root) {
        this.vsi = this.gps.getChildById("VSpeed");
        this.vsi.aircraft = Aircraft.CJ4;
        this.vsi.gps = this.gps;
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {

        //const fmaValues = JSON.parse(WTDataStore.get('CJ4_fmaValues', '{ }'));
        const fmaValues = JSON.parse(localStorage.getItem("CJ4_fmaValues"));

        var vSpeed = Math.round(Simplane.getVerticalSpeed());
        this.vsi.setAttribute("vspeed", vSpeed.toString());

        if (Simplane.getAutoPilotVerticalSpeedHoldActive() && (fmaValues.verticalMode === 'VS' || fmaValues.verticalMode === 'VVS')) {
            const selVSpeed = Math.round(Simplane.getAutoPilotVerticalSpeedHoldValue());
            this.vsi.setAttribute("selected_vspeed", selVSpeed.toString());
            this.vsi.setAttribute("selected_vspeed_active", "true");
        } else {
            this.vsi.setAttribute("selected_vspeed_active", "false");
        }

        const donutVSpeed = SimVar.GetSimVarValue("L:WT_CJ4_DONUT", "number");
        if (Math.abs(donutVSpeed) > 100) {
            this.vsi.setAttribute("vnav_vspeed", donutVSpeed.toString());
            this.vsi.setAttribute("vnav_vspeed_active", "true");
        } else {
            this.vsi.setAttribute("vnav_vspeed_active", "false");
        }
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class CJ4_Airspeed extends NavSystemElement {
    constructor() {
        super();
    }
    init(root) {
        this.airspeed = this.gps.getChildById("Airspeed");
        this.airspeed.aircraft = Aircraft.CJ4;
        this.airspeed.gps = this.gps;
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {
        this.airspeed.update(_deltaTime);
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class CJ4_Altimeter extends NavSystemElement {
    constructor() {
        super();
    }
    init(root) {
        this.altimeter = this.gps.getChildById("Altimeter");
        this.altimeter.aircraft = Aircraft.CJ4;
        this.altimeter.gps = this.gps;
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {
        this.altimeter.update(_deltaTime);
    }
    onExit() {
    }
    onEvent(_event) {
        switch (_event) {
            case "BARO_INC":
                SimVar.SetSimVarValue("K:KOHLSMAN_INC", "number", 1);
                break;
            case "BARO_DEC":
                SimVar.SetSimVarValue("K:KOHLSMAN_DEC", "number", 1);
                break;
            case "MTRS_ON":
                this.altimeter.showMTRS(true);
                break;
            case "MTRS_OFF":
                this.altimeter.showMTRS(false);
                break;
        }
    }
    showMTRS(_val) {
        this.altimeter.showMTRS(_val);
    }
    isMTRSVisible() {
        return this.altimeter.isMTRSVisible();
    }
}
class CJ4_Attitude extends NavSystemElement {
    init(root) {
        this.svg = this.gps.getChildById("Horizon");
        this.svg.aircraft = Aircraft.CJ4;
        this.svg.gps = this.gps;
        this.wtFlightDirectorBankValue = 0;
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {
        var xyz = Simplane.getOrientationAxis();
        if (xyz) {
            this.svg.setAttribute("horizon", (xyz.pitch / Math.PI * 180).toString());
            this.svg.setAttribute("pitch", (xyz.pitch / Math.PI * 180).toString());
            this.svg.setAttribute("bank", (xyz.bank / Math.PI * 180).toString());
        }
        this.svg.setAttribute("slip_skid", Simplane.getInclinometer().toString());
        this.svg.setAttribute("radio_altitude", Simplane.getAltitudeAboveGround().toString());
        this.svg.setAttribute("flight_director-active", SimVar.GetSimVarValue("AUTOPILOT FLIGHT DIRECTOR ACTIVE", "Bool") ? "true" : "false");
        this.svg.setAttribute("flight_director-pitch", SimVar.GetSimVarValue("AUTOPILOT FLIGHT DIRECTOR PITCH", "degree"));
        // const apMasterActive = SimVar.GetSimVarValue("AUTOPILOT MASTER", "Bool") == 1;
        this.svg.setAttribute("flight_director-bank", SimVar.GetSimVarValue("AUTOPILOT FLIGHT DIRECTOR BANK", "degree"));

        // if (apMasterActive) {
        //     this.svg.setAttribute("flight_director-bank", SimVar.GetSimVarValue("AUTOPILOT FLIGHT DIRECTOR BANK", "degree"));
        // } else {

        //     const bank = SimVar.GetSimVarValue("L:WT_FLIGHT_DIRECTOR_BANK", "number");
        //     let setBank = bank;
        //     if (Math.abs(this.wtFlightDirectorBankValue - bank) > 0.5) {
        //         setBank = bank < this.wtFlightDirectorBankValue + 0.5 ? this.wtFlightDirectorBankValue - 0.5 : bank > this.wtFlightDirectorBankValue ? this.wtFlightDirectorBankValue + 1 : bank;
        //     }
        //     this.wtFlightDirectorBankValue = setBank;
        //     this.svg.setAttribute("flight_director-bank", (-1 * setBank));
        // }
        this.svg.setAttribute("half_bank-active", SimVar.GetSimVarValue("AUTOPILOT MAX BANK", "degree").toFixed(0));
        this.svg.setAttribute("flight_director-style", this.gps.fdMode);

    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class CJ4_APDisplay extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.altimeterIndex = 0;
    }
    init(root) {
        this.AP_ApprActive = new CJ4_FGSDisplaySlot(this.gps.getChildById("apprActiveField"));
        // this.fdSyncField = this.gps.getChildById("fdSyncField");
        this.AP_LateralActive = new CJ4_FGSDisplaySlot(this.gps.getChildById("lateralActiveField"), true);
        this.AP_LateralArmed = new CJ4_FGSDisplaySlot(this.gps.getChildById("lateralArmField"));
        this.AP_Status = this.gps.getChildById("ap_ydEngageField");
        this.AP_FDIndicatorArrow = this.gps.getChildById("fdIndicatorArrow");
        this.AP_VerticalActive = new CJ4_FGSDisplaySlot(this.gps.getChildById("verticalActiveField"), true);
        this.AP_ModeReference_Icon = this.gps.getChildById("verticalCaptureDataField_Icon");
        this.AP_ModeReference_Value = this.gps.getChildById("verticalCaptureDataField_Value");
        this.AP_VerticalArmed = new CJ4_FGSDisplaySlot(this.gps.getChildById("verticalArmField"));
        this.AP_VNAVArmed = new CJ4_FGSDisplaySlot(this.gps.getChildById("vnavArmField"));
        this.AP_ApprVerticalArmed = new CJ4_FGSDisplaySlot(this.gps.getChildById("approachVerticalArmField"));

        if (this.gps.instrumentXmlConfig) {
            const altimeterIndexElems = this.gps.instrumentXmlConfig.getElementsByTagName("AltimeterIndex");
            if (altimeterIndexElems.length > 0) {
                this.altimeterIndex = parseInt(altimeterIndexElems[0].textContent) + 1;
            }
        }
        SimVar.SetSimVarValue("K:AP_ALT_VAR_SET_ENGLISH:1", "feet", 10000);
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {

        const apMasterActive = SimVar.GetSimVarValue("AUTOPILOT MASTER", "Bool") == 1;
        const ydActive = SimVar.GetSimVarValue("AUTOPILOT YAW DAMPER", "Boolean") == 1;
        const flightDirector = SimVar.GetSimVarValue("AUTOPILOT FLIGHT DIRECTOR ACTIVE", "Boolean") == 1;
        const precisionApproachMode = false; //TODO set to match description in manual (enables double arrow in FMA)
        const rightFDEngaged = false; //TODO set when right FD is primary (turns arrow in FMA)

        // TODO work in basic implementation of arrow logic
        // if(rightFDEngaged){
        //     this.AP_FDIndicatorArrow.classList.add("right")
        // }else{
        //     this.AP_FDIndicatorArrow.classList.remove("right")
        // }

        // if(precisionApproachMode){
        //     this.AP_FDIndicatorArrow.classList.add("both")
        // }else{
        //     this.AP_FDIndicatorArrow.classList.remove("both")
        // }

        if (apMasterActive) {
            Avionics.Utils.diffAndSet(this.AP_Status, "AP");
            this.AP_FDIndicatorArrow.setAttribute("state", "Engaged");
        } else if (!apMasterActive && ydActive) {
            Avionics.Utils.diffAndSet(this.AP_Status, "YD");
            this.AP_FDIndicatorArrow.removeAttribute("state");
        } else {
            Avionics.Utils.diffAndSet(this.AP_Status, "");
            this.AP_FDIndicatorArrow.removeAttribute("state");
        }

        if (apMasterActive && !ydActive) {
            SimVar.SetSimVarValue("K:YAW_DAMPER_TOGGLE", "number", 1);
        }
        if (apMasterActive && !flightDirector) {
            SimVar.SetSimVarValue("K:TOGGLE_FLIGHT_DIRECTOR", "number", 1);
        }

        if (flightDirector || apMasterActive) {
            const fmaValues = localStorage.getItem("CJ4_fmaValues");
            if (fmaValues) {
                const parsedFmaValues = JSON.parse(fmaValues);
                const approachActive = parsedFmaValues.approachActive;
                const lateralMode = parsedFmaValues.lateralMode;
                const lateralArmed = parsedFmaValues.lateralArmed;
                const verticalMode = parsedFmaValues.verticalMode;
                const altitudeArmed = parsedFmaValues.altitudeArmed;
                const vnavArmed = parsedFmaValues.vnavArmed;
                const approachVerticalArmed = parsedFmaValues.approachVerticalArmed;

                //ACTIVE VERTICAL
                if (verticalMode == "VS" || verticalMode == "VVS") {
                    this.AP_VerticalActive.setDisplayValue(verticalMode);
                    this.AP_ModeReference_Icon.style.display = "none";
                    Avionics.Utils.diffAndSet(this.AP_ModeReference_Value, fastToFixed(SimVar.GetSimVarValue("AUTOPILOT VERTICAL HOLD VAR", "feet per minute"), 0));
                } else if (verticalMode == "FLC" || verticalMode == "VFLC") {
                    this.AP_VerticalActive.setDisplayValue(verticalMode);
                    this.AP_ModeReference_Icon.style.display = "inline";
                    if (Simplane.getAutoPilotMachModeActive()) {
                        const machValue = SimVar.GetSimVarValue("AUTOPILOT MACH HOLD VAR", "mach");
                        Avionics.Utils.diffAndSet(this.AP_ModeReference_Value, "M" + machValue.toFixed(2).slice(1));
                    } else {
                        Avionics.Utils.diffAndSet(this.AP_ModeReference_Value, fastToFixed(SimVar.GetSimVarValue("AUTOPILOT AIRSPEED HOLD VAR", "knots"), 0));
                    }
                } else {
                    this.AP_VerticalActive.setDisplayValue(verticalMode);
                    this.AP_ModeReference_Icon.style.display = "none";
                    Avionics.Utils.diffAndSet(this.AP_ModeReference_Value, "");
                }

                //VERTICAL ALTITUDE ARMED
                this.AP_VerticalArmed.setDisplayValue(altitudeArmed);

                //VERTICAL VNAV ARMED
                if (vnavArmed === 'NOPATH') {
                    this.AP_VNAVArmed.setDisplayValue('PATH');
                    this.AP_VNAVArmed.setFailed(true);
                } else {
                    this.AP_VNAVArmed.setFailed(false);
                    this.AP_VNAVArmed.setDisplayValue(vnavArmed);
                }

                //VERTICAL APPR VERTICAL (GS/GP) ARMED
                this.AP_ApprVerticalArmed.setDisplayValue(approachVerticalArmed);

                //LATERAL ACTIVE
                this.AP_LateralActive.setDisplayValue(lateralMode);

                //LATERAL ARMED
                this.AP_LateralArmed.setDisplayValue(lateralArmed);

                //APPR ACTIVE
                this.AP_ApprActive.setDisplayValue(approachActive);
            }
        } else {
            this.AP_VerticalActive.setDisplayValue(""); //VERTICAL MODE
            Avionics.Utils.diffAndSet(this.AP_ModeReference_Value, ""); //VERTICAL MODE VAL (if needed)
            this.AP_VerticalArmed.setDisplayValue(""); //VERTICAL ALTITUDE ARMED
            this.AP_VNAVArmed.setDisplayValue(""); //VERTICAL VNAV ARMED
            this.AP_ApprVerticalArmed.setDisplayValue(""); //VERTICAL APPR VERTICAL (GS/GP) ARMED
            this.AP_LateralActive.setDisplayValue(""); //LATERAL ACTIVE
            this.AP_LateralArmed.setDisplayValue(""); //LATERAL ARMED
            this.AP_ApprActive.setDisplayValue(""); //APPR ACTIVE
        }
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class CJ4_ILS extends NavSystemElement {
    constructor() {
        super(...arguments);
        this.altWentAbove500 = false;
    }
    init(root) {
        this.ils = this.gps.getChildById("ILS");
        this.ils.aircraft = Aircraft.CJ4;
        this.ils.gps = this.gps;
    }
    onEnter() {
    }
    onUpdate(_deltaTime) {

        if (this.ils) {
            this.altWentAbove500 = true;
            let lDevState = LDevState.NONE;
            let vDevState = VDevState.NONE;

            if (this.gps.mapNavigationSource === 1 || this.gps.mapNavigationSource === 2) {
                const isLoc = SimVar.GetSimVarValue("NAV HAS LOCALIZER:" + this.gps.mapNavigationSource, "bool");
                const isGs = SimVar.GetSimVarValue("NAV HAS GLIDE SLOPE:" + this.gps.mapNavigationSource, "bool");
                lDevState = isLoc ? LDevState.ILS : LDevState.NONE;
                vDevState = isGs ? VDevState.ILS : VDevState.NONE;
            } else if (this.gps.mapNavigationSource === 0) {
                const isLoc = SimVar.GetSimVarValue("NAV HAS LOCALIZER:1", "bool");
                const isGs = SimVar.GetSimVarValue("NAV HAS GLIDE SLOPE:1", "bool");
                const navToNavTransferState = SimVar.GetSimVarValue('L:WT_NAV_TO_NAV_TRANSFER_STATE', 'number');

                const isGhostLoc = isLoc && navToNavTransferState >= 3 && !Simplane.getIsGrounded();
                const isGhostGs = isGs && navToNavTransferState >= 3 && !Simplane.getIsGrounded();

                const isVnav = SimVar.GetSimVarValue('L:WT_CJ4_SNOWFLAKE', 'number') === 1;
                const isRnav = SimVar.GetSimVarValue('L:WT_NAV_SENSITIVITY', 'number') > 2;

                const isPpos = this.gps.mapDisplayMode === 4;

                lDevState = isRnav || isPpos ? LDevState.LNAV : LDevState.NONE;
                vDevState = isVnav ? VDevState.VNAV : VDevState.NONE;

                switch (lDevState) {
                    case LDevState.NONE:
                        if (isGhostLoc) {
                            lDevState = LDevState.GHOST_ONLY;
                        }
                        break;
                    case LDevState.LNAV:
                        if (isGhostLoc) {
                            lDevState = LDevState.GHOST_AND_LNAV;
                        }
                        break;
                }
                switch (vDevState) {
                    case VDevState.NONE:
                        if (isGhostGs) {
                            vDevState = VDevState.GHOST_ONLY;
                        }
                        break;
                    case VDevState.VNAV:
                        if (isGhostGs) {
                            vDevState = VDevState.GHOST_AND_VNAV;
                        }
                        break;
                }
            }
            this.ils.showLocalizer(lDevState, this.gps.mapNavigationSource);
            this.ils.showGlideslope(vDevState);
            this.ils.update(_deltaTime);
        }
    }
    onExit() {
    }
    onEvent(_event) {
    }
}
class LDevState { }
LDevState.ILS = 'ILS';
LDevState.LNAV = 'LNAV';
LDevState.GHOST_ONLY = 'GHOST_ONLY';
LDevState.GHOST_AND_LNAV = 'GHOST_AND_LNAV';
LDevState.NONE = 'NONE';

class VDevState { }
VDevState.ILS = 'ILS';
VDevState.VNAV = 'VNAV';
VDevState.GHOST_ONLY = 'GHOST_ONLY';
VDevState.GHOST_AND_VNAV = 'GHOST_AND_VNAV';
VDevState.NONE = 'NONE';

registerInstrument("cj4-pfd-element", CJ4_PFD);