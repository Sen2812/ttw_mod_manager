--- TTW Campaign Helpers — MCT settings
--- Requires Mod Configuration Tool (MCT).

if not get_mct then return end

local mct = get_mct()
local mct_mod = mct:register_mod("ttw_campaign_helpers")

mct_mod:set_title("TTW Campaign Helpers / 战役辅助", false)
mct_mod:set_description("Optional campaign modifiers and unit abilities for the player faction. 玩家派系战役辅助与单位能力。", false)
mct_mod:set_author("TTW Mod Manager")

------------------------------------------------------------------------------------------------------------------------------
-- Unit abilities
------------------------------------------------------------------------------------------------------------------------------
local ability_section = mct_mod:add_new_section("ttw_unit_abilities")
ability_section:set_localised_text("单位能力 / Unit abilities", false)

local infantry_shieldwall = mct_mod:add_new_option("infantry_shieldwall", "checkbox")
infantry_shieldwall:set_text("步兵 — 盾墙 / Infantry Shieldwall", false)
infantry_shieldwall:set_tooltip_text("为步兵解锁盾墙阵型能力。", false)
infantry_shieldwall:set_default_value(false)

local range_dig_in = mct_mod:add_new_option("range_dig_in", "checkbox")
range_dig_in:set_text("远程 — 构筑阵地 / Dig In", false)
range_dig_in:set_tooltip_text("为远程部队解锁构筑阵地能力。", false)
range_dig_in:set_default_value(false)

local cavalry_lance = mct_mod:add_new_option("cavalry_lance", "checkbox")
cavalry_lance:set_text("骑兵 — 骑枪阵型 / Lance Formation", false)
cavalry_lance:set_tooltip_text("为骑兵解锁骑枪阵型能力。", false)
cavalry_lance:set_default_value(false)

local cavalry_charge = mct_mod:add_new_option("cavalry_charge", "checkbox")
cavalry_charge:set_text("骑兵 — 势不可挡 / Unstoppable Charge", false)
cavalry_charge:set_tooltip_text("强化骑兵冲锋，附带特殊能力。", false)
cavalry_charge:set_default_value(false)

local damage_reflect = mct_mod:add_new_option("damage_reflect", "slider")
damage_reflect:set_text("全军 — 反伤刺甲 / Thorns Armor", false)
damage_reflect:set_tooltip_text("0=关闭；1=+10 伤害反射；2=+20；3=+30", false)
damage_reflect:slider_set_min_max(0, 3)
damage_reflect:set_default_value(0)
damage_reflect:slider_set_step_size(1)

------------------------------------------------------------------------------------------------------------------------------
-- Faction
------------------------------------------------------------------------------------------------------------------------------
local faction_section = mct_mod:add_new_section("ttw_faction")
faction_section:set_localised_text("派系 / Faction", false)

local faction_item_fuse = mct_mod:add_new_option("faction_item_fuse", "slider")
faction_item_fuse:set_text("effects_description_wh3_main_effect_unique_item_fusing_chance", true)
faction_item_fuse:slider_set_min_max(0, 100)
faction_item_fuse:set_default_value(0)
faction_item_fuse:slider_set_step_size(10)

local faciton_growth = mct_mod:add_new_option("faciton_growth", "slider")
faciton_growth:set_text("effects_description_wh3_main_effect_province_growth_faction", true)
faciton_growth:slider_set_min_max(0, 2000)
faciton_growth:set_default_value(0)
faciton_growth:slider_set_step_size(50)

local faciton_economy_gdpe = mct_mod:add_new_option("faciton_economy_gdpe", "slider")
faciton_economy_gdpe:set_text("effects_description_wh_main_effect_economy_gdp_mod_all", true)
faciton_economy_gdpe:slider_set_min_max(0, 200)
faciton_economy_gdpe:set_default_value(0)
faciton_economy_gdpe:slider_set_step_size(10)

local faciton_research_point = mct_mod:add_new_option("faciton_research_point", "slider")
faciton_research_point:set_text("ui_text_replacements_localised_text_research_rate", true)
faciton_research_point:slider_set_min_max(0, 1000)
faciton_research_point:set_default_value(0)
faciton_research_point:slider_set_step_size(50)

------------------------------------------------------------------------------------------------------------------------------
-- Army
------------------------------------------------------------------------------------------------------------------------------
local army_section = mct_mod:add_new_section("ttw_army")
army_section:set_localised_text("军队 / Army", false)

local army_movement_range_post_battle_win = mct_mod:add_new_option("army_movement_range_post_battle_win", "slider")
army_movement_range_post_battle_win:set_text("effects_description_wh3_main_effect_force_all_campaign_movement_range_post_battle_win", true)
army_movement_range_post_battle_win:slider_set_min_max(0, 100)
army_movement_range_post_battle_win:set_default_value(0)
army_movement_range_post_battle_win:slider_set_step_size(10)

local army_replenishment_rate = mct_mod:add_new_option("army_replenishment_rate", "slider")
army_replenishment_rate:set_text("effects_description_wh_main_effect_force_all_campaign_replenishment_rate", true)
army_replenishment_rate:slider_set_min_max(0, 20)
army_replenishment_rate:set_default_value(0)
army_replenishment_rate:slider_set_step_size(1)

local army_healing_cap = mct_mod:add_new_option("army_healing_cap", "slider")
army_healing_cap:set_text("effects_description_wh3_dlc20_effect_healing_cap_modifier", true)
army_healing_cap:slider_set_min_max(0, 500)
army_healing_cap:set_default_value(0)
army_healing_cap:slider_set_step_size(50)

local army_barrier_replenish_delay = mct_mod:add_new_option("army_barrier_replenish_delay", "slider")
army_barrier_replenish_delay:set_text("effects_description_wh3_main_effect_battle_barrier_replenish_delay_mod", true)
-- Negative = faster recovery (buff only); positive would slow recovery.
army_barrier_replenish_delay:slider_set_min_max(-100, 0)
army_barrier_replenish_delay:set_default_value(0)
army_barrier_replenish_delay:slider_set_step_size(10)

local army_exp_gain = mct_mod:add_new_option("army_exp_gain", "slider")
army_exp_gain:set_text("effects_description_wh3_dlc20_effect_xp_gain_all_units", true)
army_exp_gain:slider_set_min_max(0, 500)
army_exp_gain:set_default_value(0)
army_exp_gain:slider_set_step_size(25)

------------------------------------------------------------------------------------------------------------------------------
-- Character
------------------------------------------------------------------------------------------------------------------------------
local char_section = mct_mod:add_new_section("ttw_character")
char_section:set_localised_text("将领 / Characters", false)

local char_spell_mastery = mct_mod:add_new_option("char_spell_mastery", "slider")
char_spell_mastery:set_text("effects_description_wh3_main_effect_spell_mastery", true)
char_spell_mastery:slider_set_min_max(0, 200)
char_spell_mastery:set_default_value(0)
char_spell_mastery:slider_set_step_size(10)

local char_magic_range = mct_mod:add_new_option("char_magic_range", "slider")
char_magic_range:set_text("effects_description_wh3_main_effect_spell_targeting_range_all", true)
char_magic_range:slider_set_min_max(0, 200)
char_magic_range:set_default_value(0)
char_magic_range:slider_set_step_size(10)

local char_magic_cooldown = mct_mod:add_new_option("char_magic_cooldown", "slider")
char_magic_cooldown:set_text("effects_description_wh2_dlc12_effect_magic_cooldown_all_lores", true)
-- Negative = shorter cooldown (buff only); positive would lengthen it.
char_magic_cooldown:slider_set_min_max(-100, 0)
char_magic_cooldown:set_default_value(0)
char_magic_cooldown:slider_set_step_size(10)

local char_experience_mod = mct_mod:add_new_option("char_experience_mod", "slider")
char_experience_mod:set_text("effects_description_wh3_main_effect_character_campaign_experience_mod", true)
char_experience_mod:slider_set_min_max(0, 500)
char_experience_mod:set_default_value(0)
char_experience_mod:slider_set_step_size(10)
