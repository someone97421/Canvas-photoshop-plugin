import { Flex, Select, Typography } from 'antd';
import { useUIWeightCSS } from '../../utils';
import { BaseWidgetProps } from './_base';

export interface DropdownWidgetProps extends BaseWidgetProps {
    onSelectUpdate: (identify: string, index: number) => void;
    options: string[];
    labels: string[];
    value: string;
    name?: string;
    extraOptions?: Record<string, any>;
}

export const ComboWidget: React.FC<DropdownWidgetProps> = ({
    onSelectUpdate,
    options,
    labels,
    value,
    name,
    uiWeight
}) => {
    // 处理选择变化
    const handleSelect = (selectedValue: string) => {
        const selectedIndex = options.indexOf(selectedValue);
        onSelectUpdate(selectedValue, selectedIndex);
    };
    const uiWeightCSS = useUIWeightCSS(uiWeight || 12);
    const useLabel = labels.length == options.length;

    return (
        <Flex
            style={{ width: '100%', ...uiWeightCSS }}
            align='center'
        >
            {name && <span style={{ flex: 1, fontSize: 12, flexShrink: 0, minWidth: '60px' }}>{name}</span>}
            <Select
                value={value}
                options={options.map((option, index) => ({ value: option, label: useLabel ? labels[index] : option }))}
                style={{ flex: 2, minWidth: 0 }}
                onSelect={handleSelect}
                showSearch
                filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
            />
        </Flex>
    );
};


