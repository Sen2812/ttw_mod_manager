--- TTW Campaign Helpers — campaign script (MCT-driven).
--- Requires Mod Configuration Tool. Reads options from mct mod key "ttw_campaign_helpers".

local BUNDLE_KEY = "ttw_campaign_helpers_bundle"
local CONFIG_SIG_KEY = "ttw_campaign_helpers_config_sig"
local MCT_MOD_KEY = "ttw_campaign_helpers"

local config = {
    infantry_shieldwall = false,
    range_dig_in = false,
    cavalry_lance = false,
    cavalry_charge = false,
    damage_reflect = 0,
    faction_item_fuse = 0,
    faciton_growth = 0,
    faciton_economy_gdpe = 0,
    faciton_research_point = 0,
    army_movement_range_post_battle_win = 0,
    army_replenishment_rate = 0,
    army_healing_cap = 0,
    army_barrier_replenish_delay = 0,
    army_exp_gain = 0,
    char_spell_mastery = 0,
    char_magic_range = 0,
    char_magic_cooldown = 0,
    char_experience_mod = 0,
}

local function read_opt(mct_mod, key)
    local opt = mct_mod:get_option_by_key(key)
    if not opt then return nil end
    return opt:get_finalized_setting()
end

local function load_mct_config()
    if not get_mct then
        return false
    end
    local mct = get_mct()
    if not mct then return false end
    local my_mct = mct:get_mod_by_key(MCT_MOD_KEY)
    if not my_mct then return false end

    for key, _ in pairs(config) do
        local v = read_opt(my_mct, key)
        if type(v) == "boolean" then
            -- Legacy checkbox → mid tier (or off)
            if key == "damage_reflect" then
                config[key] = v and 2 or 0
            else
                config[key] = v
            end
        elseif type(v) == "number" then
            -- MCT sliders may return floats (e.g. 1.0)
            if key == "damage_reflect" then
                config[key] = math.floor(v + 0.5)
            else
                config[key] = v
            end
        end
    end
    return true
end

local function config_signature()
    local parts = {}
    for key, v in pairs(config) do
        parts[#parts + 1] = tostring(key) .. "=" .. tostring(v)
    end
    table.sort(parts)
    return table.concat(parts, "|")
end

local function any_effect_enabled()
    for _, v in pairs(config) do
        if v == true then return true end
        if type(v) == "number" and v ~= 0 then return true end
    end
    return false
end

local function apply_effects(effect_bundle)
    if config.infantry_shieldwall then
        effect_bundle:add_effect("ttw_unit_buffs_infantry_shieldwall", "faction_to_force_own", 1)
    end
    if config.range_dig_in then
        effect_bundle:add_effect("ttw_unit_buffs_range_dig_in", "faction_to_force_own", 1)
    end
    if config.cavalry_lance then
        effect_bundle:add_effect("ttw_unit_buffs_cavalry_lance", "faction_to_force_own", 1)
    end
    if config.cavalry_charge then
        effect_bundle:add_effect("ttw_unit_buffs_cavalry_charge", "faction_to_force_own", 1)
    end
    if config.damage_reflect == 1 then
        effect_bundle:add_effect("ttw_unit_buffs_enable_damage_reflect_t1", "faction_to_force_own", 1)
    elseif config.damage_reflect == 2 then
        effect_bundle:add_effect("ttw_unit_buffs_enable_damage_reflect_t2", "faction_to_force_own", 1)
    elseif config.damage_reflect == 3 then
        effect_bundle:add_effect("ttw_unit_buffs_enable_damage_reflect_t3", "faction_to_force_own", 1)
    end

    if config.faction_item_fuse ~= 0 then
        effect_bundle:add_effect("wh3_main_effect_unique_item_fusing_chance", "faction_to_faction_own_unseen", config.faction_item_fuse)
    end
    if config.faciton_growth ~= 0 then
        effect_bundle:add_effect("wh3_main_effect_province_growth_faction", "faction_to_province_own", config.faciton_growth)
    end
    if config.faciton_economy_gdpe ~= 0 then
        effect_bundle:add_effect("wh_main_effect_economy_gdp_mod_all", "faction_to_region_own", config.faciton_economy_gdpe)
    end
    if config.faciton_research_point ~= 0 then
        effect_bundle:add_effect("wh_main_effect_technology_research_points", "faction_to_faction_own_unseen", config.faciton_research_point)
    end

    if config.army_movement_range_post_battle_win ~= 0 then
        effect_bundle:add_effect("wh3_main_effect_force_all_campaign_movement_range_post_battle_win", "faction_to_character_own_unseen", config.army_movement_range_post_battle_win)
    end
    if config.army_replenishment_rate ~= 0 then
        effect_bundle:add_effect("wh_main_effect_force_all_campaign_replenishment_rate", "faction_to_force_own_unseen", config.army_replenishment_rate)
    end
    if config.army_healing_cap ~= 0 then
        effect_bundle:add_effect("wh3_dlc20_effect_healing_cap_modifier", "faction_to_force_own_unseen", config.army_healing_cap)
    end
    if config.army_barrier_replenish_delay ~= 0 then
        effect_bundle:add_effect("wh3_main_effect_battle_barrier_replenish_delay_mod", "faction_to_force_own_unseen", config.army_barrier_replenish_delay)
    end
    if config.army_exp_gain ~= 0 then
        effect_bundle:add_effect("wh3_dlc20_effect_xp_gain_all_units", "faction_to_force_own_unseen", config.army_exp_gain)
    end

    if config.char_spell_mastery ~= 0 then
        effect_bundle:add_effect("wh3_main_effect_spell_mastery", "faction_to_character_own", config.char_spell_mastery)
    end
    if config.char_magic_range ~= 0 then
        effect_bundle:add_effect("wh3_main_effect_spell_targeting_range_all", "faction_to_character_own", config.char_magic_range)
    end
    if config.char_magic_cooldown ~= 0 then
        effect_bundle:add_effect("wh2_dlc12_effect_magic_cooldown_all_lores", "faction_to_character_own", config.char_magic_cooldown)
    end
    if config.char_experience_mod ~= 0 then
        effect_bundle:add_effect("wh3_main_effect_character_campaign_experience_mod", "faction_to_character_own", config.char_experience_mod)
    end
end

local function ttw_campaign_helpers_init(force)
    if not load_mct_config() then
        return
    end

    local sig = config_signature()
    if not force then
        local saved_sig = cm:get_saved_value(CONFIG_SIG_KEY)
        if saved_sig == sig then
            return
        end
    end

    local faction = cm:get_local_faction()
    if not faction or faction:is_null_interface() then
        return
    end

    if faction:has_effect_bundle(BUNDLE_KEY) then
        cm:remove_effect_bundle(BUNDLE_KEY, faction:name())
    end

    if not any_effect_enabled() then
        cm:set_saved_value(CONFIG_SIG_KEY, sig)
        return
    end

    local effect_bundle = cm:create_new_custom_effect_bundle(BUNDLE_KEY)
    effect_bundle:set_duration(0)
    apply_effects(effect_bundle)
    cm:apply_custom_effect_bundle_to_faction(effect_bundle, faction)
    cm:set_saved_value(CONFIG_SIG_KEY, sig)
end

-- MCT may finish after first tick; always (re)apply when settings are ready.
core:add_listener(
    "ttw_campaign_helpers_MctInitialized",
    "MctInitialized",
    true,
    function()
        ttw_campaign_helpers_init(true)
    end,
    true
)

cm:add_first_tick_callback(function()
    ttw_campaign_helpers_init(false)
end)
